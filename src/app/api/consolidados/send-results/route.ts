import { NextResponse } from 'next/server';
import { SendResultsUseCase } from '@/features/envio-resultados/application/sendResults';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { makeEmailService } from '@/features/envio-resultados/infrastructure/email/emailService';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Constants ----

const MAX_FILES = 10;

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
    typeof obj.name === 'string'
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

    // ---- 3. Parse + validate `fileRefs` JSON ----
    const fileRefsRaw = formData.get('fileRefs');
    if (typeof fileRefsRaw !== 'string') {
      return buildError('VALIDATION_ERROR', '"fileRefs" is required', 400);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileRefsRaw);
    } catch {
      return buildError('VALIDATION_ERROR', '"fileRefs" must be valid JSON', 400);
    }
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
      if (!/^\d+$/.test(ref.dni)) {
        return buildError(
          'VALIDATION_ERROR',
          `"dni" must be numeric: ${ref.dni}`,
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

    // ---- 4. Delegate to the use case ----
    const useCase = new SendResultsUseCase(getFileRepository(), makeEmailService());
    const result = await useCase.execute({
      to,
      ...(cc ? { cc } : {}),
      subject,
      html,
      fileRefs: parsed,
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
