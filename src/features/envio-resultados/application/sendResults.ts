import type { IEmailService, IFileRepository } from '../domain/ports';
import type { EmailAttachment, SelectedFileRef } from '../domain/entities';
import { sanitizeDownloadName, sanitizeFolderPath } from '@/lib/sanitize-filename';

// ---- Limits (must match the route's contract) ----

/** Maximum number of fileRefs the route accepts (per `MAX_FILES` in the route). */
export const MAX_FILES = 10;

/** Per-file size cap: 10 MB. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

// ---- Use case ----

/**
 * PR #2 — orchestrates the consolidated send pipeline:
 *
 * 1. Validate the `fileRefs` payload (limits, sanitisation).
 * 2. For each ref, ask the `IFileRepository` for a stream and
 *    collect the bytes into a `Buffer` (with a 10 MB cap).
 * 3. Hand the assembled `EmailAttachment[]` to the `IEmailService`
 *    with `cc`/`subject`/`html`.
 *
 * The use case never throws; every failure mode becomes a typed
 * `SendResultsResult` so the route maps cleanly to HTTP status.
 */
export class SendResultsUseCase {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(params: SendResultsParams): Promise<SendResultsResult> {
    // ---- 1. Refs: empty + limit ----
    if (params.fileRefs.length === 0) {
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'At least one fileRef is required',
      };
    }
    if (params.fileRefs.length > MAX_FILES) {
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        error: `Maximum ${MAX_FILES} files allowed, got ${params.fileRefs.length}`,
      };
    }

    // ---- 2. Sanitise + read + collect ----
    const attachments: EmailAttachment[] = [];
    console.log('[SendResultsUseCase.execute] starting file resolution', {
      count: params.fileRefs.length,
      refs: params.fileRefs,
    });
    for (const ref of params.fileRefs) {
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
        return {
          success: false,
          code: 'VALIDATION_ERROR',
          error: `Invalid fileRef: ${err instanceof Error ? err.message : 'unknown'}`,
        };
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
          return {
            success: false,
            code: 'VALIDATION_ERROR',
            error: `File not found: ${safeName}`,
          };
        }
        return {
          success: false,
          code: 'INTERNAL_ERROR',
          error: err instanceof Error ? err.message : 'I/O error',
        };
      }

      try {
        const buffer = await streamToBuffer(stream, MAX_FILE_BYTES);
        attachments.push({ filename: safeName, content: buffer });
      } catch (err) {
        return {
          success: false,
          code: 'INTERNAL_ERROR',
          error: err instanceof Error ? err.message : 'Stream error',
        };
      }
    }

    // ---- 3. Dispatch ----
    const result = await this.emailService.sendWithAttachments({
      to: params.to,
      ...(params.cc && params.cc.length > 0 ? { cc: params.cc } : {}),
      subject: params.subject,
      html: params.html,
      attachments,
    });

    if (result.success) {
      return { success: true, messageId: result.messageId ?? '<unknown>' };
    }
    return {
      success: false,
      code: 'SMTP_ERROR',
      error: result.error ?? 'Unknown SMTP error',
    };
  }
}
