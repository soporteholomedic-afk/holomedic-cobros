import { NextResponse } from 'next/server';
import { sendEmail } from '@/utils/sendEmail';
import { getSession } from '@/lib/auth';
import { registrarAuditoriaCobranza } from '@/features/cobranza/infrastructure/registrarAuditoriaCobranza';

// ---- Request / Response types ----

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

/**
 * Accepted `purpose` values (REQ-01 DIR-08). Mirrors the `Purpose` union
 * in `@/utils/sendEmail` — single source of truth is that union; this
 * const exists so the route can validate without importing the type at
 * runtime. Absent/undefined purpose defaults to `'facturacion'`
 * (total back-compat for current consumers); an unknown value is a 400.
 */
const PURPOSES = ['consolidados', 'facturacion', 'cobranza'] as const;

/** Simple email regex — checks for user@domain.tld structure */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * REQ-02 audit context for cobranza sends (design §3.1). Everything
 * the immutable audit row needs, resolved BEFORE the send attempt so
 * all three audit branches (success, transport failure, unexpected
 * exception) can share one snapshot. `null` for non-cobranza
 * purposes (R2) and until payload validation completes — the outer
 * catch guards on it so pre-parse throws are never mis-audited.
 */
interface CobranzaAuditContext {
  destinatarios: string[];
  copias: string[] | null;
  asunto: string;
  cuerpoResumen: string;
  enviadoPor: string;
  ruc: string;
  razonSocial: string | null;
  montoReclamado: number | null;
  moneda: string | null;
  comprobantesCount: number | null;
}

/** Upper bound for `DECIMAL(18,2)` money columns: 10^16 − 0.01. */
const MAX_MONTO_RECLAMADO = 10 ** 16 - 0.01;

/**
 * Build the REQ-02 audit context for a `purpose === 'cobranza'`
 * send. Validates the optional metadata (present-but-wrong-type →
 * 400 VALIDATION_ERROR; absent → stored NULL for back-compat) and
 * resolves `enviadoPor` from the session (`nombre.trim() ||
 * 'sistema'`, contactos/send-results precedent). Returns the context
 * or a 400 response when validation fails.
 */
async function buildCobranzaAuditContext(
  body: Record<string, unknown>,
  to: string[],
  cc: string[] | undefined,
): Promise<CobranzaAuditContext | NextResponse<ErrorResponse>> {
  if (typeof body.ruc !== 'string' || body.ruc.trim() === '') {
    return buildError('VALIDATION_ERROR', 'Missing required field: ruc', 400);
  }
  // R6: trimmed; 8–11-digit keys are standard and any other non-empty
  // trimmed value is audited AS-IS (junk-key audit) — writes are not
  // filtered by key validity.
  const ruc = body.ruc.trim();

  let razonSocial: string | null = null;
  if (body.razonSocial !== undefined && body.razonSocial !== null) {
    if (typeof body.razonSocial !== 'string') {
      return buildError('VALIDATION_ERROR', 'Invalid razonSocial: must be a string', 400);
    }
    const trimmed = body.razonSocial.trim();
    razonSocial = trimmed === '' ? null : trimmed;
  }

  let montoReclamado: number | null = null;
  if (body.montoReclamado !== undefined && body.montoReclamado !== null) {
    const value = body.montoReclamado;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > MAX_MONTO_RECLAMADO
    ) {
      return buildError(
        'VALIDATION_ERROR',
        'Invalid montoReclamado: must be a finite number ≥ 0 within DECIMAL(18,2) bounds',
        400,
      );
    }
    montoReclamado = value;
  }

  let moneda: string | null = null;
  if (body.moneda !== undefined && body.moneda !== null) {
    if (typeof body.moneda !== 'string') {
      return buildError('VALIDATION_ERROR', 'Invalid moneda: must be a string', 400);
    }
    const trimmed = body.moneda.trim();
    if (trimmed.length > 10) {
      return buildError('VALIDATION_ERROR', 'Invalid moneda: longer than 10 characters', 400);
    }
    moneda = trimmed === '' ? null : trimmed;
  }

  let comprobantesCount: number | null = null;
  if (body.comprobantesCount !== undefined && body.comprobantesCount !== null) {
    const value = body.comprobantesCount;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return buildError(
        'VALIDATION_ERROR',
        'Invalid comprobantesCount: must be an integer ≥ 0',
        400,
      );
    }
    comprobantesCount = value;
  }

  // R1.5 sender fallback: the authenticated session user, or
  // 'sistema' when the session exposes no usable name.
  const session = await getSession();
  const enviadoPor = session?.nombre?.trim() || 'sistema';

  return {
    destinatarios: to,
    copias: cc ?? null,
    asunto: body.subject as string,
    cuerpoResumen: body.html as string,
    enviadoPor,
    ruc,
    razonSocial,
    montoReclamado,
    moneda,
    comprobantesCount,
  };
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
  // Declared before the try so the outer catch can audit unexpected
  // exceptions once the context exists (design §3.1); null for
  // non-cobranza purposes and until validation completes.
  let auditContext: CobranzaAuditContext | null = null;
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

    // Validate optional purpose against the whitelist (REQ-01 DIR-08).
    // Absent/undefined → 'facturacion' (back-compat default for the shape
    // used today); present but not whitelisted → 400.
    let purpose: (typeof PURPOSES)[number] = 'facturacion';
    if (body.purpose !== undefined) {
      if (
        typeof body.purpose !== 'string' ||
        !(PURPOSES as readonly string[]).includes(body.purpose)
      ) {
        return buildError(
          'VALIDATION_ERROR',
          `Invalid purpose: ${typeof body.purpose === 'string' ? body.purpose : 'must be a string'}`,
          400
        );
      }
      // Membership in PURPOSES is checked above; the cast only refines
      // the narrowed `string` to the literal union (no runtime effect).
      purpose = body.purpose as (typeof PURPOSES)[number];
    }

    // REQ-02: resolve the audit context for cobranza sends BEFORE the
    // send attempt. Metadata is client-supplied (D3): extended payload
    // fields, validated present-but-wrong-type → 400; absent → NULL
    // (back-compat). Non-cobranza purposes skip this entirely (R2).
    if (purpose === 'cobranza') {
      const resolved = await buildCobranzaAuditContext(body, to, cc);
      if (resolved instanceof NextResponse) {
        return resolved;
      }
      auditContext = resolved;
    }

    // Send email
    const result = await sendEmail({
      to,
      ...(cc ? { cc } : {}),
      subject: body.subject as string,
      html: body.html as string,
      purpose,
    });

    if (!result.success) {
      // REQ-02 R1.2: audit the transport failure before mapping the
      // operator-visible error response. Best-effort — the helper
      // never throws (D2), so this cannot change the outcome below.
      if (auditContext) {
        await registrarAuditoriaCobranza({
          ...auditContext,
          estadoEnvio: 'FAILED',
          errorDetalle: result.error,
        });
      }
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

    // REQ-02 R1.1: audit the successful attempt before responding.
    // Awaited so the attempt is recorded by response time; the helper
    // swallows its own failures (D2) so an audit outage never
    // surfaces to the operator.
    if (auditContext) {
      await registrarAuditoriaCobranza({
        ...auditContext,
        estadoEnvio: 'SUCCESS',
        errorDetalle: null,
      });
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
    // REQ-02 R1.3: audit the exception when the attempt got far
    // enough to have a context (guards against pre-parse throws).
    // registrarAuditoriaCobranza never throws by contract (task 3.3),
    // so this await cannot produce an unhandled rejection.
    if (auditContext) {
      await registrarAuditoriaCobranza({
        ...auditContext,
        estadoEnvio: 'FAILED',
        errorDetalle: message,
      });
    }
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
