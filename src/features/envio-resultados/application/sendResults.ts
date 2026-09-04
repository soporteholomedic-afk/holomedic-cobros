import type {
  IEmailService,
  IEnvioHistoryRepository,
  IFileRepository,
  IPdfCompressor,
  PdfCompressionMethod,
  PdfCompressionSkipReason,
} from '../domain/ports';
import type {
  EmailAttachment,
  EnvioAttachmentSnapshot,
  EnvioHistoryInsert,
  LocalAttachmentInput,
  SelectedFileRef,
} from '../domain/entities';
import { sanitizeDownloadName, sanitizeFolderPath } from '@/lib/sanitize-filename';
import {
  looksLikeGeneratedCertificate,
  renameGeneratedCertificate,
} from '../domain/generated-files/renameGeneratedCertificate';
import { parseReadyFile } from '../domain/ready-files/parseReadyFile';
import { renameReadyFile } from '../domain/ready-files/renameReadyFile';
import {
  findDeliveryNameCollisions,
  validateDeliveryName,
  type DeliveryNameIssue,
} from '../domain/attachments/validateDeliveryName';

// ---- Limits (must match the route's contract) ----

/** Maximum number of fileRefs the route accepts (per `MAX_FILES` in the route). */
export const MAX_FILES = 10;

/** Per-file size cap: 30 MB. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

/**
 * Read allowance for a single UNC file when a compressor is attached:
 * 60 MB (2 × `MAX_FILE_BYTES`). The 30 MB per-file cap is still enforced —
 * but on the POST-compression result, not on the raw stream (RF3). Without
 * a compressor the legacy `MAX_FILE_BYTES` read cap applies unchanged.
 */
export const MAX_READ_BYTES_WITH_COMPRESSION = 2 * MAX_FILE_BYTES;

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

// ---- PDF sniff + size formatting (compression seam helpers) ----

const PDF_MAGIC_BYTES = Buffer.from('%PDF-');

/**
 * Magic-byte sniff for PDF content. Magic beats extensions: delivery
 * names are renamed/sanitised before dispatch, so the `%PDF-` header is
 * the only reliable "is this a PDF" signal (RF3).
 */
function isPdfBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES);
}

/** Format a byte count as MB with one decimal, for size-explicit errors. */
function toMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

// ---- Size metrics logging (RF5) ----

/** Console tag for one per-file compression outcome. */
const PDF_METRICS_TAG = '[SendResultsUseCase] pdf metrics';

/** Console tag for the per-send aggregate (distinct, grep-able tag). */
const PDF_METRICS_AGGREGATE_TAG = '[SendResultsUseCase] pdf metrics aggregate';

/**
 * One per-file row of the RF5 size-metrics log — the production size
 * profile (A3) that will justify (or kill) the future pdfcpu adapter.
 * `skippedReason` is present ONLY when the file was skipped (no port
 * result): `not-pdf` for non-PDF bytes, or the port's own reason
 * (`grew`) on passthrough. A fail-open carry carries no reason — the
 * accompanying `console.warn` records the error.
 */
export interface PdfMetricsRow {
  file: string;
  originalBytes: number;
  finalBytes: number;
  method: PdfCompressionMethod;
  durationMs: number;
  skippedReason?: PdfCompressionSkipReason;
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

/**
 * Human-readable message for a rejected delivery-name override.
 * REQ-03: the message must identify the offending file, so it carries
 * the STORED disk name (`ref.name`), never the rejected override text.
 */
function describeDeliveryNameIssue(storedName: string, issue: DeliveryNameIssue): string {
  switch (issue.code) {
    case 'TRAVERSAL':
      return `Invalid delivery name for "${storedName}": "..", "/" and "\\" are not allowed`;
    case 'ILLEGAL_CHAR':
      return `Invalid delivery name for "${storedName}": contains illegal characters`;
    case 'BAD_EXTENSION':
      return `Invalid delivery name for "${storedName}": only ".pdf" is allowed here (got "${issue.got}")`;
    case 'TOO_LONG':
      return `Invalid delivery name for "${storedName}": too long (${issue.length} characters, max 255)`;
    case 'DUPLICATE':
      return `Duplicate delivery name in batch: "${issue.name}"`;
  }
}

/**
 * Validate the per-ref delivery-name overrides (step 1c, D7) and
 * compute the EFFECTIVE delivery name for every ref (REQ-04
 * precedence: `override ?? renameReadyFile ?? renameGeneratedCertificate`).
 *
 * Pure — no I/O — so `execute` can run it BEFORE the history INSERT
 * and reuse the result for both the snapshot and the dispatch loop,
 * keeping recorded history byte-identical to what was dispatched (D5).
 *
 * Rejections (first failure wins, typed `VALIDATION_ERROR` message):
 * - Per-ref rules via `validateDeliveryName` (D2/D4/D5): traversal,
 *   illegal characters, forced `.pdf` where the auto-rename pipeline
 *   applies (D5: `parseReadyFile` OR `looksLikeGeneratedCertificate`),
 *   and the 255-char final-length cap. An empty/whitespace override is
 *   NOT a rejection — it falls back to the auto name (REQ-01/REQ-07).
 * - Batch collisions via `findDeliveryNameCollisions` (D6): only
 *   duplicates INVOLVING an override reject; auto-auto duplicates stay
 *   allowed (legacy same-name batches keep working).
 */
function resolveDeliveryNames(
  refs: readonly SelectedFileRef[],
  fallbackNombreCompleto: string,
  fallbackDestino: string,
): { ok: true; names: string[] } | { ok: false; error: string } {
  const overrides: (string | null)[] = [];
  for (const ref of refs) {
    if (ref.deliveryName === undefined) {
      overrides.push(null);
      continue;
    }
    const forcePdf =
      parseReadyFile(ref.name) !== null || looksLikeGeneratedCertificate(ref.name);
    const check = validateDeliveryName(ref.deliveryName, { forcePdf });
    if (!check.ok) {
      return { ok: false, error: describeDeliveryNameIssue(ref.name, check.issue) };
    }
    overrides.push(check.value === '' ? null : check.value);
  }

  const names = refs.map((ref, i) => {
    const override = overrides[i] ?? null;
    if (override !== null) return override;
    const rawName = safeDisplayName(ref.name);
    const nombreCompleto = ref.nombreCompleto?.trim() || fallbackNombreCompleto;
    const readyName = renameReadyFile({
      rawName,
      nombreCompleto,
      // REQ-104 (D4): per-ref proyecto wins over the request-level
      // destino — exactly the nombreCompleto precedence pattern.
      // Empty/whitespace post-trim → request-level destino.
      destino: ref.proyecto?.trim() || fallbackDestino,
      tipoExamen: ref.tipoExamen,
    });
    // Mirror the download routes' dual rename: a CLI-generated
    // certificate (`{idAten}_{idePMe}_{arcPla}.pdf`) never matches the
    // ready-file pattern, so without this fallback the emailed
    // attachment keeps the raw CLI name while the same file downloaded
    // from the app gets `CAMO_{nombreCompleto}.pdf`.
    return readyName === rawName
      ? renameGeneratedCertificate({ rawName, nombreCompleto, tipoExamen: ref.tipoExamen })
      : readyName;
  });

  const collisions = findDeliveryNameCollisions(
    names.map((value, i) => ({ value, overridden: overrides[i] != null })),
  );
  if (collisions.length > 0) {
    const first = collisions[0]!; // length > 0 checked above — [0] always exists
    return { ok: false, error: describeDeliveryNameIssue('', first) };
  }

  return { ok: true, names };
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
 *    collect the bytes into a `Buffer` (30 MB read cap; with a PDF
 *    compressor attached the allowance doubles and the cap is enforced
 *    on the post-compression result instead).
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
    /**
     * Optional lossless compression seam (RF3). Domain-only import —
     * infrastructure adapters are wired at the composition root. Absent
     * (or PDF_COMPRESSION_ENABLED=false upstream) → the pipeline runs
     * byte-identical legacy, INCLUDING legacy cap ordering.
     */
    private readonly pdfCompressor?: IPdfCompressor,
  ) {}

  /**
   * Compression seam for the EMAILED COPY only (RF3/RF6): PDF-magic
   * buffers are compressed, everything else passes through untouched.
   * Fail-open (spec): a compressor throw/timeout NEVER fails a send —
   * the original bytes are attached and dispatch proceeds. The source
   * buffer on the share is never written back.
   *
   * Returns the bytes to attach plus the RF5 metrics row. The row is
   * logged here for EVERY compression outcome (shrink, passthrough/
   * grew, not-pdf skip, fail-open) and returned so the caller can fold
   * it into the per-send aggregate. `null` when no compressor is
   * attached — kill-switch-off runs emit zero metrics output.
   */
  private async compressForEmail(
    content: Buffer,
    file: string,
  ): Promise<{ content: Buffer; metrics: PdfMetricsRow | null }> {
    if (!this.pdfCompressor) return { content, metrics: null };
    if (!isPdfBytes(content)) {
      const metrics: PdfMetricsRow = {
        file,
        originalBytes: content.length,
        finalBytes: content.length,
        method: 'pdf-lib-passthrough',
        durationMs: 0,
        skippedReason: 'not-pdf',
      };
      console.log(PDF_METRICS_TAG, metrics);
      return { content, metrics };
    }
    const startedAt = Date.now();
    try {
      const result = await this.pdfCompressor.compress(content);
      const metrics: PdfMetricsRow = {
        file,
        // The seam's own byte counts are the ground truth of the
        // profile: original = what entered, final = what is attached.
        originalBytes: content.length,
        finalBytes: result.bytes.length,
        method: result.method,
        durationMs: result.durationMs,
        ...(result.skippedReason ? { skippedReason: result.skippedReason } : {}),
      };
      console.log(PDF_METRICS_TAG, metrics);
      return { content: result.bytes, metrics };
    } catch (err) {
      console.warn('[SendResultsUseCase] compression failed — attaching original bytes', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-open: no port result exists, so no skip reason applies —
      // the warn line above carries the error; the row records the
      // effective outcome (original bytes attached, zero saved).
      const metrics: PdfMetricsRow = {
        file,
        originalBytes: content.length,
        finalBytes: content.length,
        method: 'pdf-lib-passthrough',
        durationMs: Date.now() - startedAt,
      };
      console.log(PDF_METRICS_TAG, metrics);
      return { content, metrics };
    }
  }

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

    // ---- 1b/1c. Delivery names: validate overrides + precedence → snapshot + INSERT ----
    // (D7) `resolveDeliveryNames` validates every override and resolves
    // the effective names BEFORE the history INSERT — an invalid
    // override is operator-input validation (MAX_FILES precedent):
    // typed VALIDATION_ERROR with NO row, NO file I/O, NO email. The
    // names are computed once and reused by BOTH the snapshot and the
    // dispatch loop, so recorded history always matches what was
    // attached (D5).
    const resolvedNames = resolveDeliveryNames(params.fileRefs, params.nombreCompleto, params.destino);
    if (!resolvedNames.ok) {
      return { success: false, code: 'VALIDATION_ERROR', error: resolvedNames.error };
    }
    const { names: deliveryNames } = resolvedNames;

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
        // REQ-107: conditionally spread — the key is OMITTED when the
        // ref carried no proyecto, keeping legacy rows byte-compatible
        // (S-107.2).
        ...(ref.proyecto ? { proyecto: ref.proyecto } : {}),
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
    // RF5 per-send accumulator: one row per compression outcome, folded
    // into the aggregate logged after BOTH loops below.
    const metricsRows: PdfMetricsRow[] = [];
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
        // Cap reordering (RF3): with a compressor attached the read
        // allowance doubles — the 30 MB per-file cap is enforced on the
        // POST-compression result below. Without a compressor the legacy
        // ordering is preserved verbatim: streamToBuffer throws at 30 MB
        // and the catch maps it to INTERNAL_ERROR exactly as before.
        const readCap = this.pdfCompressor ? MAX_READ_BYTES_WITH_COMPRESSION : MAX_FILE_BYTES;
        const buffer = await streamToBuffer(stream, readCap);
        // Reuse the precomputed delivery name so the dispatched
        // attachment name is byte-identical to the persisted snapshot
        // (and the metrics row names the same file the operator sees).
        const deliveryName = deliveryNames[i] ?? safeName;
        const { content, metrics } = await this.compressForEmail(buffer, deliveryName);
        if (metrics) metricsRows.push(metrics);
        if (content.length > MAX_FILE_BYTES) {
          const error =
            `File "${deliveryName}" exceeds the 30 MB email limit after compression ` +
            `(original ${toMb(buffer.length)} MB, compressed ${toMb(content.length)} MB)`;
          await finishRecord('error', error);
          return { success: false, code: 'VALIDATION_ERROR', error };
        }
        attachments.push({ filename: deliveryName, content });
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
      // Same emailed-copy compression treatment as UNC refs (RF3), but
      // these stay EXEMPT from the per-file cap — no size check here.
      const { content, metrics } = await this.compressForEmail(local.content, safeName);
      if (metrics) metricsRows.push(metrics);
      attachments.push({
        filename: safeName,
        content,
        contentType: local.contentType,
      });
    }

    // ---- 3b. Per-send metrics aggregate (RF5) ----
    // Emitted only when compression ran (compressor attached) — the
    // kill-switch-off pipeline is byte-identical legacy, logs included.
    if (this.pdfCompressor) {
      const originalBytesTotal = metricsRows.reduce((total, row) => total + row.originalBytes, 0);
      const finalBytesTotal = metricsRows.reduce((total, row) => total + row.finalBytes, 0);
      console.log(PDF_METRICS_AGGREGATE_TAG, {
        files: metricsRows.length,
        originalBytesTotal,
        finalBytesTotal,
        savedBytesTotal: originalBytesTotal - finalBytesTotal,
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
