import type {
  IEmailService,
  IEnvioHistoryRepository,
  IFileRepository,
} from '../domain/ports';
import type {
  EmailAttachment,
  EnvioAttachmentSnapshot,
  EnvioHistoryInsert,
  LocalAttachmentInput,
  SelectedFileRef,
} from '../domain/entities';
import { sanitizeDownloadName, sanitizeFolderPath } from '@/lib/sanitize-filename';
import { renameReadyFile } from '../domain/ready-files/renameReadyFile';

// ---- Limits (must match the route's contract) ----

/** Maximum number of fileRefs the route accepts (per `MAX_FILES` in the route). */
export const MAX_FILES = 10;

/** Per-file size cap: 30 MB. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

// ---- Result discriminated union ----

/**
 * Discriminated union returned by `SendResultsUseCase.execute`. The
 * route maps `code` to an HTTP status (VALIDATION_ERROR → 400,
 * INTERNAL_ERROR → 500, SMTP_ERROR → 502). The route's
 * `route.test.ts` asserts the mapping.
 */
export type SendResultsCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR' | 'SMTP_ERROR';

export type SendResultsResult =
  | { success: true; messageId: string }
  | { success: false; code: SendResultsCode; error: string };

// ---- Params ----

export interface SendResultsParams {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  fileRefs: SelectedFileRef[];
  /** Local files dropped from the OS. Merged into the same
   *  `EmailAttachment[]` as the LAN `fileRefs` for dispatch. */
  localAttachments?: LocalAttachmentInput[];
  nombreCompleto: string;
  destino: string;
  /**
   * Attribution context persisted on the history row. The route always
   * threads it (sentBy from the JWT session with the `'sistema'`
   * fallback, companyId/companyName from the client). Absent → the
   * documented defaults are recorded; the row is ALWAYS created.
   */
  context?: SendResultsContext;
}

/** History attribution carried from the send-results route. */
export interface SendResultsContext {
  sentBy: string;
  companyId: string;
  companyName: string;
}

// ---- streamToBuffer (exported for testability) ----

/**
 * Drain a Node `ReadableStream` into a single `Buffer`, with a hard
 * byte cap. Throws when the cap is exceeded so the caller surfaces
 * it as `INTERNAL_ERROR` (matches the spec's "mid-stream I/O"
 * failure mode). Sequential `for await` over chunks gives stable
 * byte-equal semantics for the real-bytes regression test.
 */
export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  capBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array);
    total += buf.length;
    if (total > capBytes) {
      throw new Error(`File exceeds ${capBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

// ---- Sanitisation helper ----

/**
 * Run the existing `sanitizeFolderPath` + `sanitizeDownloadName`
 * helpers on a ref. Throws on traversal; the caller's catch maps
 * the error to `VALIDATION_ERROR`.
 */
function sanitizeRef(ref: SelectedFileRef): { safePath: string; safeName: string } {
  return {
    safePath: sanitizeFolderPath(ref.path),
    safeName: sanitizeDownloadName(ref.name),
  };
}

/**
 * Sanitize a ref name for the pre-INSERT delivery-name precompute.
 * Pure and total: on a traversal-shaped name the raw value passes
 * through and the send loop's own `sanitizeRef` fails later, AFTER the
 * history row exists — so even that failure is recorded (spec: every
 * use-case-level failure updates a row).
 */
function safeDisplayName(rawName: string): string {
  try {
    return sanitizeDownloadName(rawName);
  } catch {
    return rawName;
  }
}

// ---- Use case ----

/**
 * PR #2 — orchestrates the consolidated send pipeline:
 *
 * 1. Validate the `fileRefs` payload (limits, sanitisation).
 * 2. Insert a `pendiente` history row (write-then-send, BEFORE any
 *    file read or dispatch) with the full attachment snapshot and
 *    precomputed delivery names.
 * 3. For each ref, ask the `IFileRepository` for a stream and
 *    collect the bytes into a `Buffer` (with a 30 MB cap).
 * 4. Hand the assembled `EmailAttachment[]` to the `IEmailService`
 *    with `cc`/`subject`/`html`.
 * 5. UPDATE the history row to `enviado` / `error`(+detail).
 *
 * History is best-effort (design D4): an insert/update failure is
 * logged and the send proceeds. A crash between INSERT and UPDATE
 * leaves the honest `pendiente` orphan (D2).
 *
 * The use case never throws on typed failure paths; every failure mode
 * becomes a typed `SendResultsResult` so the route maps cleanly to
 * HTTP status (a throwing email service still propagates — that is
 * the crash-between case, and the orphan row stays).
 */
export class SendResultsUseCase {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly emailService: IEmailService,
    /** History recorder; when omitted the send runs unrecorded (tests/legacy). */
    private readonly historyRepo?: IEnvioHistoryRepository,
  ) {}

  async execute(params: SendResultsParams): Promise<SendResultsResult> {
    // ---- 1. Refs: count cap only ----
    // Sending without attachments is allowed (the operator confirms
    // the empty selection in the UI); the loop below simply produces
    // an empty `attachments` array.
    if (params.fileRefs.length > MAX_FILES) {
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        error: `Maximum ${MAX_FILES} files allowed, got ${params.fileRefs.length}`,
      };
    }

    // ---- 1b. History: precompute delivery names, snapshot, INSERT ----
    // `renameReadyFile` is pure — the delivery names computed here are
    // BOTH persisted in the snapshot AND reused by the dispatch loop,
    // so the recorded history always matches what was attached (D5).
    const deliveryNames = params.fileRefs.map((ref) =>
      renameReadyFile({
        rawName: safeDisplayName(ref.name),
        nombreCompleto: ref.nombreCompleto?.trim() || params.nombreCompleto,
        destino: params.destino,
        tipoExamen: ref.tipoExamen,
      }),
    );
    const snapshot: EnvioAttachmentSnapshot[] = [
      ...params.fileRefs.map((ref, i): EnvioAttachmentSnapshot => ({
        source: 'unc',
        ruc: ref.ruc,
        dni: ref.dni,
        idAten: ref.idAten,
        path: ref.path,
        storedName: ref.name,
        deliveryName: deliveryNames[i] ?? ref.name,
        ...(ref.tipoExamen ? { tipoExamen: ref.tipoExamen } : {}),
        ...(ref.nombreCompleto ? { nombreCompleto: ref.nombreCompleto } : {}),
      })),
      ...(params.localAttachments ?? []).map(
        (local): EnvioAttachmentSnapshot => ({
          source: 'local',
          storedName: local.filename,
          contentType: local.contentType,
          sizeBytes: local.content.length,
        }),
      ),
    ];
    const ctx = params.context;
    const insertPayload: EnvioHistoryInsert = {
      status: 'pendiente',
      sentBy: ctx?.sentBy?.trim() || 'sistema',
      destino: params.destino,
      companyId: ctx?.companyId ?? '',
      companyName: ctx?.companyName ?? '',
      nombreCompleto: params.nombreCompleto,
      toRecipients: params.to,
      ccRecipients: params.cc ?? [],
      subject: params.subject,
      bodyHtml: params.html,
      attachments: snapshot,
    };

    let recordId: string | null = null;
    if (this.historyRepo) {
      try {
        recordId = await this.historyRepo.insert(insertPayload);
      } catch (err) {
        // D4 best-effort: the send proceeds without history.
        console.error('[SendResultsUseCase.execute] history insert failed', err);
      }
    }

    /** Best-effort final status UPDATE; never masks the send outcome. */
    const finishRecord = async (
      status: 'enviado' | 'error',
      errorDetail: string | null = null,
    ): Promise<void> => {
      if (!recordId || !this.historyRepo) return;
      try {
        await this.historyRepo.updateStatus(recordId, status, errorDetail);
      } catch (err) {
        console.error('[SendResultsUseCase.execute] history updateStatus failed', err);
      }
    };

    // ---- 2. Sanitise + read + collect ----
    const attachments: EmailAttachment[] = [];
    console.log('[SendResultsUseCase.execute] starting file resolution', {
      count: params.fileRefs.length,
      refs: params.fileRefs,
    });
    for (const [i, ref] of params.fileRefs.entries()) {
      let safePath: string;
      let safeName: string;
      try {
        ({ safePath, safeName } = sanitizeRef(ref));
        console.log('[SendResultsUseCase.execute] sanitised ref', {
          original: ref,
          safePath,
          safeName,
        });
      } catch (err) {
        console.error('[SendResultsUseCase.execute] sanitisation failed', { ref, err });
        const error = `Invalid fileRef: ${err instanceof Error ? err.message : 'unknown'}`;
        await finishRecord('error', error);
        return { success: false, code: 'VALIDATION_ERROR', error };
      }

      let stream: NodeJS.ReadableStream;
      try {
        stream = await this.fileRepository.read(
          ref.ruc,
          ref.dni,
          ref.idAten,
          safePath,
          safeName,
        );
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        console.error('[SendResultsUseCase.execute] read failed', {
          ref,
          safePath,
          safeName,
          code,
          error: err instanceof Error ? err.message : 'I/O error',
        });
        if (code === 'ENOENT') {
          const error = `File not found: ${safeName}`;
          await finishRecord('error', error);
          return { success: false, code: 'VALIDATION_ERROR', error };
        }
        const error = err instanceof Error ? err.message : 'I/O error';
        await finishRecord('error', error);
        return { success: false, code: 'INTERNAL_ERROR', error };
      }

      try {
        const buffer = await streamToBuffer(stream, MAX_FILE_BYTES);
        // Reuse the precomputed delivery name so the dispatched
        // attachment name is byte-identical to the persisted snapshot.
        attachments.push({ filename: deliveryNames[i] ?? safeName, content: buffer });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Stream error';
        await finishRecord('error', error);
        return { success: false, code: 'INTERNAL_ERROR', error };
      }
    }

    // ---- 3. Local attachments (already validated by route — no size/count cap) ----
    for (const local of params.localAttachments ?? []) {
      let safeName: string;
      try {
        safeName = sanitizeDownloadName(local.filename);
      } catch (err) {
        const error = `Invalid local filename: ${err instanceof Error ? err.message : 'unknown'}`;
        await finishRecord('error', error);
        return { success: false, code: 'VALIDATION_ERROR', error };
      }
      attachments.push({
        filename: safeName,
        content: local.content,
        contentType: local.contentType,
      });
    }

    // ---- 4. Dispatch ----
    const result = await this.emailService.sendWithAttachments({
      to: params.to,
      ...(params.cc && params.cc.length > 0 ? { cc: params.cc } : {}),
      subject: params.subject,
      html: params.html,
      attachments,
    });

    // ---- 5. Final history status ----
    if (result.success) {
      await finishRecord('enviado');
      return { success: true, messageId: result.messageId ?? '<unknown>' };
    }
    const smtpError = result.error ?? 'Unknown SMTP error';
    await finishRecord('error', smtpError);
    return {
      success: false,
      code: 'SMTP_ERROR',
      error: smtpError,
    };
  }
}
