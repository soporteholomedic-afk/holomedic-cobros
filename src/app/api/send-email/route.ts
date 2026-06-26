import { NextResponse } from 'next/server';
import { sendEmail } from '@/utils/sendEmail';

// ---- Request / Response types ----

interface SendEmailBody {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

interface SuccessResponse {
  success: true;
  messageId: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code:
    | 'VALIDATION_ERROR'
    | 'SMTP_AUTH_ERROR'
    | 'SMTP_TIMEOUT'
    | 'SMTP_ERROR'
    | 'INTERNAL_ERROR';
}

type ApiResponse = SuccessResponse | ErrorResponse;

// ---- Helpers ----

const MAX_BODY_SIZE = 1_000_000; // 1MB

/** Simple email regex — checks for user@domain.tld structure */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildError(
  code: ErrorResponse['code'],
  error: string,
  status: number
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- POST handler ----

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    // Check body size before parsing
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return buildError(
        'VALIDATION_ERROR',
        'Body too large — maximum 1MB',
        413
      );
    }

    // Parse JSON body
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return buildError(
        'VALIDATION_ERROR',
        'Invalid JSON body',
        400
      );
    }

    // Validate required fields
    if (typeof raw !== 'object' || raw === null) {
      return buildError(
        'VALIDATION_ERROR',
        'Request body must be a JSON object',
        400
      );
    }

    const body = raw as Record<string, unknown>;

    const missingFields: string[] = [];
    if (typeof body.subject !== 'string' || !body.subject) missingFields.push('subject');
    if (typeof body.html !== 'string' || !body.html) missingFields.push('html');

    if (missingFields.length > 0) {
      return buildError(
        'VALIDATION_ERROR',
        `Missing required fields: ${missingFields.join(', ')}`,
        400
      );
    }

    // Validate 'to' is a non-empty array
    if (!Array.isArray(body.to) || body.to.length === 0) {
      return buildError(
        'VALIDATION_ERROR',
        'At least one recipient required',
        400
      );
    }

    const to = body.to as string[];
    const cc = Array.isArray(body.cc) ? (body.cc as string[]) : undefined;

    // Validate each email in 'to'
    for (const email of to) {
      if (typeof email !== 'string' || !isValidEmail(email)) {
        return buildError(
          'VALIDATION_ERROR',
          `Invalid email address: ${email}`,
          400
        );
      }
    }

    // Validate each email in 'cc' if present
    if (cc) {
      for (const email of cc) {
        if (typeof email !== 'string' || !isValidEmail(email)) {
          return buildError(
            'VALIDATION_ERROR',
            `Invalid email address in CC: ${email}`,
            400
          );
        }
      }
    }

    // Enforce max 10 total recipients
    const totalRecipients = to.length + (cc?.length ?? 0);
    if (totalRecipients > 10) {
      return buildError(
        'VALIDATION_ERROR',
        'Max 10 recipients allowed',
        400
      );
    }

    // Check body size for bodies without content-length header
    const bodyString = JSON.stringify(body);
    if (bodyString.length > MAX_BODY_SIZE) {
      return buildError(
        'VALIDATION_ERROR',
        'Body too large — maximum 1MB',
        413
      );
    }

    // Send email
    const result = await sendEmail({
      to,
      ...(cc ? { cc } : {}),
      subject: body.subject as string,
      html: body.html as string,
      purpose: 'facturacion',
    });

    if (!result.success) {
      // Map sendEmail error codes to HTTP status codes
      switch (result.code) {
        case 'SMTP_TIMEOUT':
          return buildError(result.code, result.error, 503);
        case 'SMTP_AUTH_ERROR':
        case 'SMTP_ERROR':
        default:
          return buildError(result.code, result.error, 500);
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    // Unexpected errors (shouldn't happen, but protect against them)
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('send-email route unexpected error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
