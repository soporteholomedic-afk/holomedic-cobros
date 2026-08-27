import { NextResponse } from 'next/server';
import { SendResultsUseCase } from '@/features/envio-resultados/application/sendResults';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { makeEmailService } from '@/features/envio-resultados/infrastructure/email/emailService';
import { getEnvioHistoryDb } from '@/features/envio-resultados/infrastructure/getEnvioHistoryDb';
import type { IEnvioHistoryRepository } from '@/features/envio-resultados/domain/ports';
import type { LocalAttachmentInput, SelectedFileRef } from '@/features/envio-resultados/domain/entities';
import { sanitizeDownloadName } from '@/lib/sanitize-filename';
import { isSafeDocumentKey } from '@/lib/normalize-dni';
import { getSession } from '@/lib/auth';

// ---- Constants ----

const MAX_FILES = 10;

/** Total cumulative size cap for all local file attachments. */
const MAX_LOCAL_BYTES_TOTAL = 50 * 1024 * 1024;

// ---- Response types ----

interface SuccessResponse {
  success: true;
  messageId: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code: 'VALIDATION_ERROR' | 'SMTP_ERROR' | 'INTERNAL_ERROR';
}

type ApiResponse = SuccessResponse | ErrorResponse;

// ---- Helpers ----

function buildError(
  code: ErrorResponse['code'],
  error: string,
  status: number,
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function parseCommaSeparated(value: string | null): string[] | undefined {
  if (!value || !value.trim()) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Type guard for a `SelectedFileRef` shape received from the
 * untrusted FormData JSON. The route's role is to reject
 * malformed payloads before they reach the use case.
 */
function isFileRefShape(v: unknown): v is SelectedFileRef {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.dni === 'string' &&
    typeof obj.idAten === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.name === 'string' &&
    // Optional per-ref patient name (multi-patient wizard sends).
    // String-when-present: a non-string value must 400 here —
    // otherwise the use case's `.trim()` would throw and surface
    // as 500 INTERNAL_ERROR.
    (obj.nombreCompleto === undefined || typeof obj.nombreCompleto === 'string') &&
    // Optional per-ref project (multi-proyecto wizard sends) —
    // same string-when-present rationale (D10, REQ-106 backstop).
    (obj.proyecto === undefined || typeof obj.proyecto === 'string')
  );
}

// ---- POST handler ----

/**
 * POST /api/consolidados/send-results
 *
 * PR #2 — the consolidated send pipeline. The route accepts a
 * `fileRefs` JSON field (an array of `SelectedFileRef` —
 * `ruc`/`dni`/`idAten`/`path`/`name`) and delegates to
 * `SendResultsUseCase`, which resolves each ref to a real `Buffer`
 * via `IFileRepository.read` and hands it to the email service.
 *
 * Wire format:
 * - `to`     — comma-separated list (required)
 * - `cc`     — comma-separated list (optional)
 * - `subject` — string (required)
 * - `html`    — string (required)
 * - `fileRefs` — JSON string (required, non-empty array, max 10)
 *
 * The legacy `files` `File`-part is rejected with `VALIDATION_ERROR`
 * (clean break — PR #3 will rewire the hook to send `fileRefs`).
 *
 * Error code → HTTP status:
 * - `VALIDATION_ERROR` → 400
 * - `INTERNAL_ERROR`   → 500
 * - `SMTP_ERROR`       → 502
 */
export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return buildError('VALIDATION_ERROR', 'Invalid form data', 400);
    }

    // ---- 1. Reject any legacy `files` File-part ----
    // PR #2 — clean break. The old `files` File-part is gone;
    // clients must send `fileRefs` JSON.
    const legacyFiles = formData.getAll('files').filter((f) => f instanceof File);
    if (legacyFiles.length > 0) {
      return buildError('VALIDATION_ERROR', 'Route consumes fileRefs only', 400);
    }

    // ---- 2. Parse text fields ----
    const to = parseCommaSeparated(formData.get('to') as string | null);
    const cc = parseCommaSeparated(formData.get('cc') as string | null);
    const subject = formData.get('subject') as string | null;
    const html = formData.get('html') as string | null;
    const nombreCompleto = (formData.get('nombreCompleto') as string | null) ?? '';
    const destino = (formData.get('destino') as string | null) ?? '';

    if (!to || to.length === 0) {
      return buildError(
        'VALIDATION_ERROR',
        'At least one recipient required in "to" field',
        400,
      );
    }
    if (!subject || !subject.trim()) {
      return buildError('VALIDATION_ERROR', '"subject" is required', 400);
    }
    if (!html || !html.trim()) {
      return buildError('VALIDATION_ERROR', '"html" is required', 400);
    }

    // ---- 3. Parse + validate `fileRefs` JSON (optional when localFiles present) ----
    const fileRefsRaw = formData.get('fileRefs');
    const localFilesRaw = formData.getAll('localFiles').filter((f): f is File => f instanceof File);
    const hasLocalFiles = localFilesRaw.length > 0;

    let fileRefsParsed: SelectedFileRef[] = [];

    if (typeof fileRefsRaw === 'string') {
      try {
        const parsed: unknown = JSON.parse(fileRefsRaw);
        if (!Array.isArray(parsed)) {
          return buildError('VALIDATION_ERROR', '"fileRefs" must be an array', 400);
        }
        for (const ref of parsed) {
          if (!isFileRefShape(ref)) {
            return buildError(
              'VALIDATION_ERROR',
              'Each fileRef must have ruc, dni, idAten, path, name as strings',
              400,
            );
          }
          if (!isSafeDocumentKey(ref.dni)) {
            return buildError(
              'VALIDATION_ERROR',
              `"dni" must be alphanumeric: ${ref.dni}`,
              400,
            );
          }
        }
        if (parsed.length > MAX_FILES) {
          return buildError(
            'VALIDATION_ERROR',
            `Maximum ${MAX_FILES} files allowed, got ${parsed.length}`,
            400,
          );
        }
        fileRefsParsed = parsed;
      } catch {
        return buildError('VALIDATION_ERROR', '"fileRefs" must be valid JSON', 400);
      }
    } else if (!hasLocalFiles) {
      // Neither fileRefs nor localFiles present
      return buildError('VALIDATION_ERROR', '"fileRefs" or "localFiles" is required', 400);
    }

    // ---- 4. Validate local file attachments ----
    const localAttachments: LocalAttachmentInput[] = [];
    if (hasLocalFiles) {
      let totalBytes = 0;
      for (const file of localFilesRaw) {
        totalBytes += file.size;
        if (totalBytes > MAX_LOCAL_BYTES_TOTAL) {
          return buildError(
            'VALIDATION_ERROR',
            `Total local attachments exceed ${MAX_LOCAL_BYTES_TOTAL / (1024 * 1024)} MB`,
            400,
          );
        }
        try {
          sanitizeDownloadName(file.name);
        } catch {
          return buildError(
            'VALIDATION_ERROR',
            `Invalid filename in local file: ${file.name}`,
            400,
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        localAttachments.push({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          content: buffer,
        });
      }
    }

    // ---- 5. History context + delegate to the use case ----
    // sentBy from the JWT session cookie; the row is ALWAYS created
    // (spec SHALL) — absent cookie falls back to 'sistema' (OQ1/D1).
    const session = await getSession();
    const sentBy = session?.nombre?.trim() || 'sistema';
    const companyId = (formData.get('companyId') as string | null) ?? '';
    const companyName = (formData.get('companyName') as string | null) ?? '';

    // History is best-effort (D4): a history outage must never block
    // the send — the use case runs unrecorded in that case.
    let historyRepo: IEnvioHistoryRepository | undefined;
    try {
      historyRepo = await getEnvioHistoryDb();
    } catch (err) {
      console.error('consolidados send-results: history repo unavailable', err);
    }

    const useCase = new SendResultsUseCase(getFileRepository(), makeEmailService(), historyRepo);
    const result = await useCase.execute({
      to,
      ...(cc ? { cc } : {}),
      subject,
      html,
      fileRefs: fileRefsParsed,
      localAttachments,
      nombreCompleto,
      destino,
      context: { sentBy, companyId, companyName },
    });

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId });
    }
    if (result.code === 'VALIDATION_ERROR') {
      return buildError('VALIDATION_ERROR', result.error, 400);
    }
    if (result.code === 'SMTP_ERROR') {
      return buildError('SMTP_ERROR', result.error, 502);
    }
    return buildError('INTERNAL_ERROR', result.error, 500);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('consolidados send-results route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
