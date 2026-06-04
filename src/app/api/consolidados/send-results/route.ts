import { NextResponse } from 'next/server';
import { sendEmail } from '@/utils/sendEmail';
import type { EmailAttachment } from '@/utils/sendEmail';

// ---- Constants ----

const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10 MB

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

function buildError(code: ErrorResponse['code'], error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function parseCommaSeparated(value: string | null): string[] | undefined {
  if (!value || !value.trim()) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---- POST handler ----

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return buildError('VALIDATION_ERROR', 'Invalid form data', 400);
    }

    // ---- Parse text fields ----

    const to = parseCommaSeparated(formData.get('to') as string | null);
    const cc = parseCommaSeparated(formData.get('cc') as string | null);
    const subject = formData.get('subject') as string | null;
    const html = formData.get('html') as string | null;

    // ---- Validate required fields ----

    if (!to || to.length === 0) {
      return buildError('VALIDATION_ERROR', 'At least one recipient required in "to" field', 400);
    }

    if (!subject || !subject.trim()) {
      return buildError('VALIDATION_ERROR', '"subject" is required', 400);
    }

    if (!html || !html.trim()) {
      return buildError('VALIDATION_ERROR', '"html" is required', 400);
    }

    // ---- Parse file attachments ----

    const fileEntries = formData.getAll('files') as (File | string)[];
    const files = fileEntries.filter((f): f is File => f instanceof File);

    if (files.length > MAX_FILES) {
      return buildError(
        'VALIDATION_ERROR',
        `Maximum ${MAX_FILES} files allowed, got ${files.length}`,
        400,
      );
    }

    if (files.length > 0) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        return buildError(
          'VALIDATION_ERROR',
          'Total file size exceeds 10MB limit',
          400,
        );
      }
    }

    // ---- Build attachments ----

    const attachments: EmailAttachment[] = files.map((f) => ({
      filename: f.name,
      content: Buffer.from(new Uint8Array(0)), // placeholder — will be replaced below
    }));

    // Read file contents as buffers
    const readPromises = files.map(async (f, i) => {
      const buffer = Buffer.from(await f.arrayBuffer());
      attachments[i] = {
        filename: f.name,
        content: buffer,
        ...(f.type ? { contentType: f.type } : {}),
      };
    });
    await Promise.all(readPromises);

    // ---- Send email ----

    const sendParams: Parameters<typeof sendEmail>[0] = {
      to,
      ...(cc ? { cc } : {}),
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    };

    const result = await sendEmail(sendParams);

    if (!result.success) {
      return buildError('SMTP_ERROR', result.error, 502);
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('consolidados send-results route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
