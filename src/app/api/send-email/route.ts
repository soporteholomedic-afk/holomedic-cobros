import { NextResponse } from 'next/server';
import { sendEmail } from '@/utils/sendEmail';
import type { EmailAttachment } from '@/utils/sendEmail';
import { getSession } from '@/lib/auth';
import { registrarAuditoriaCobranza } from '@/features/cobranza/infrastructure/registrarAuditoriaCobranza';
import { sanitizeComponent } from '@/lib/sanitize-filename';

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

// ---- FormData attachment limits (cobranza composer contract) ----

/** REQ cap: at most 10 attachment files per send. */
const MAX_ATTACHMENT_COUNT = 10;
/** REQ cap: at most 25MB of attachment bytes per send. */
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
/**
 * Pre-parse request-size gate for multipart bodies: the attachment
 * budget plus 1MB of multipart envelope slack (boundaries + part
 * headers). Exact per-file enforcement happens after parsing via
 * `File.size`; this gate only bounds how many bytes get buffered.
 */
const MAX_MULTIPART_REQUEST_BYTES =
  MAX_ATTACHMENT_TOTAL_BYTES + MAX_BODY_SIZE;

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

/**
 * Split a comma-joined recipient list ("a@b.com, c@d.com") into
 * trimmed, non-empty entries — the array shape the shared pipeline
 * validates (the hook joins with commas; browsers never send arrays).
 */
function splitRecipientList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

interface ParsedFormDataRequest {
  body: Record<string, unknown>;
  attachments?: EmailAttachment[];
}

/**
 * Parse a multipart/form-data request (the `useSendCobranzaEmail`
 * hook contract) into the SAME `Record<string, unknown>` shape the
 * legacy JSON path produces, so both converge on one validated
 * pipeline: recipients ≤10, html ≤1MB, purpose whitelist and the
 * REQ-02 audit branches all run unchanged on the normalized body.
 *
 * Boundary hardening before any SMTP dispatch: count (≤10 files),
 * total size (≤25MB) and filenames (sanitized) are validated here,
 * with the count/size checks running BEFORE file bytes are buffered.
 * Optional fields the hook omits (cc, moneda, montoReclamado) stay
 * undefined so the shared validation stores NULL exactly as for JSON.
 */
async function parseFormDataRequest(
  request: Request,
): Promise<ParsedFormDataRequest | NextResponse<ErrorResponse>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return buildError('VALIDATION_ERROR', 'Invalid FormData body', 400);
  }

  const entries = formData.getAll('attachments');
  const files: File[] = [];
  for (const entry of entries) {
    // Realm-safe file check: undici (server runtime) and jsdom (tests)
    // expose different File constructors, so `instanceof` cannot be
    // used across them. A FormData entry is either a string value or a
    // File part — anything string-typed under `attachments` is invalid.
    if (typeof entry === 'string') {
      return buildError(
        'VALIDATION_ERROR',
        'Invalid attachments: file parts required',
        400,
      );
    }
    files.push(entry);
  }
  if (files.length > MAX_ATTACHMENT_COUNT) {
    return buildError(
      'VALIDATION_ERROR',
      `Too many attachments — maximum ${MAX_ATTACHMENT_COUNT} files`,
      400,
    );
  }
  const totalAttachmentBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return buildError(
      'VALIDATION_ERROR',
      'Attachments too large — maximum 25MB total',
      413,
    );
  }

  const attachments: EmailAttachment[] = [];
  for (const [index, file] of files.entries()) {
    // Windows-illegal characters in uploaded filenames are replaced by
    // the existing sanitizer; a name that sanitizes to nothing (e.g.
    // whitespace-only) falls back to a deterministic placeholder.
    const filename = sanitizeComponent(file.name) || `attachment-${index + 1}`;
    attachments.push({
      filename,
      content: Buffer.from(await file.arrayBuffer()),
      ...(file.type ? { contentType: file.type } : {}),
    });
  }

  const body: Record<string, unknown> = {};

  const toRaw = formData.get('to');
  if (typeof toRaw === 'string') {
    const to = splitRecipientList(toRaw);
    if (to.length > 0) body.to = to;
  }

  const ccRaw = formData.get('cc');
  if (typeof ccRaw === 'string') {
    const cc = splitRecipientList(ccRaw);
    if (cc.length > 0) body.cc = cc;
  }

  const setStringField = (name: string): void => {
    const value = formData.get(name);
    if (typeof value === 'string') body[name] = value;
  };
  setStringField('subject');
  setStringField('html');
  setStringField('purpose');
  setStringField('ruc');
  setStringField('razonSocial');
  setStringField('moneda');

  // Numeric audit fields travel as strings in FormData; convert so the
  // shared JSON validation (typeof number / finite / integer) applies
  // unchanged. Non-numeric strings become NaN and are rejected there.
  const setNumberField = (name: string): void => {
    const value = formData.get(name);
    if (typeof value === 'string' && value.trim() !== '') {
      body[name] = Number(value);
    }
  };
  setNumberField('montoReclamado');
  setNumberField('comprobantesCount');

  return {
    body,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

// ---- POST handler ----

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  // Declared before the try so the outer catch can audit unexpected
  // exceptions once the context exists (design §3.1); null for
  // non-cobranza purposes and until validation completes.
  let auditContext: CobranzaAuditContext | null = null;
  try {
    // Content-type sniff: multipart/form-data requests (cobranza hook)
    // take the FormData branch; everything else keeps the legacy JSON
    // path byte-identical (non-goal: no breaking existing consumers).
    const contentType = request.headers.get('content-type') ?? '';
    const isFormData = contentType.toLowerCase().includes('multipart/form-data');

    // Check body size before parsing. Multipart bodies are bounded by
    // the 25MB attachment budget (+ envelope slack; the exact per-file
    // check runs after parsing); other bodies keep the 1MB JSON limit.
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (isFormData && length > MAX_MULTIPART_REQUEST_BYTES) {
        return buildError(
          'VALIDATION_ERROR',
          'Attachments too large — maximum 25MB total',
          413
        );
      }
      if (!isFormData && length > MAX_BODY_SIZE) {
        return buildError(
          'VALIDATION_ERROR',
          'Body too large — maximum 1MB',
          413
        );
      }
    }

    let body: Record<string, unknown>;
    let attachments: EmailAttachment[] | undefined;
    if (isFormData) {
      const parsed = await parseFormDataRequest(request);
      if (parsed instanceof NextResponse) {
        return parsed;
      }
      body = parsed.body;
      attachments = parsed.attachments;
    } else {
      // Parse JSON body (legacy path — unchanged)
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

      if (typeof raw !== 'object' || raw === null) {
        return buildError(
          'VALIDATION_ERROR',
          'Request body must be a JSON object',
          400
        );
      }

      body = raw as Record<string, unknown>;
    }

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
      ...(attachments ? { attachments } : {}),
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
