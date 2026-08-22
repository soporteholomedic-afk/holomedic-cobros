import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import {
  RUC_PATTERN,
  esClaveDirectorioValida,
  type EmpresaContacto,
} from '@/features/cobranza/domain/entities';
import { getContactDb } from '@/features/cobranza/infrastructure/getContactDb';
import { ContactConflictError } from '@/features/cobranza/infrastructure/sqlserver';

// ---- Response types ----

interface ContactSuccess {
  success: true;
  contacto: EmpresaContacto | null;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR' | 'CONFLICT_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = ContactSuccess | ErrorResponse;
type PutResponse = ContactSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

/** Email shape the route accepts (same convention as /api/send-email). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Type guard for the PUT body. The route's role is to reject malformed
 * payloads before they reach the repository. `emailCopia` is optional
 * (absent, null and empty string all mean "no cc"); everything else
 * is a required string.
 */
function isContactBody(
  v: unknown,
): v is { ruc: string; razonSocial: string; emailPrincipal: string; emailCopia?: string | null } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.razonSocial === 'string' &&
    typeof obj.emailPrincipal === 'string' &&
    (obj.emailCopia === undefined ||
      obj.emailCopia === null ||
      typeof obj.emailCopia === 'string')
  );
}

// ---- GET handler ----

/**
 * GET /api/cobranza/contactos?ruc=
 *
 * Resolves the memorized `to`/`cc` pair for a company key so the
 * composer can prefill. Unknown key is NOT an error — it returns 200
 * with `contacto: null` (the empty-prefill state, REQ-01-DIR-02).
 * Malformed `ruc` → 400 `VALIDATION_ERROR`; repository failure → 500
 * `INTERNAL_ERROR` with a typed JSON body.
 */
export async function GET(request: Request): Promise<NextResponse<GetResponse>> {
  try {
    const url = new URL(request.url);
    const ruc = url.searchParams.get('ruc');

    if (!ruc || !RUC_PATTERN.test(ruc)) {
      return buildError(
        'VALIDATION_ERROR',
        '"ruc" query parameter is required and must match /^\\d{8,11}$/ (RUC o DNI)',
        400,
      );
    }

    const repo = await getContactDb();
    const contacto = await repo.getByRuc(ruc);

    return NextResponse.json({ success: true, contacto });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('cobranza contactos GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}

// ---- PUT handler ----

/**
 * PUT /api/cobranza/contactos
 *
 * Idempotent upsert of the contact pair. The body shape:
 *   { ruc, razonSocial, emailPrincipal, emailCopia? }
 *
 * Validation (all → 400 `VALIDATION_ERROR`): malformed body, `ruc`
 * not matching `/^\d{8,11}$/`, junk directory key rejected by the
 * shared `esClaveDirectorioValida` guard (defense in depth — the
 * client already skips junk keys), invalid `emailPrincipal`, invalid
 * non-empty `emailCopia`.
 *
 * `updatedBy` is resolved server-side from the JWT session
 * (`session.nombre.trim() || 'sistema'`, send-results precedent) — a
 * client-sent value would be spoofable. Success → 200 with the
 * persisted `contacto`. A concurrent first-insert race
 * (`ContactConflictError`) → 409 `CONFLICT_ERROR`; other repository
 * errors → 500 `INTERNAL_ERROR`.
 */
export async function PUT(request: Request): Promise<NextResponse<PutResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('VALIDATION_ERROR', 'Request body must be valid JSON', 400);
    }

    if (!isContactBody(body)) {
      return buildError(
        'VALIDATION_ERROR',
        'Body must contain {ruc, razonSocial, emailPrincipal} as strings (emailCopia opcional)',
        400,
      );
    }

    const razonSocial = body.razonSocial.trim();
    const emailPrincipal = body.emailPrincipal.trim();
    const emailCopia =
      body.emailCopia !== undefined && body.emailCopia !== null && body.emailCopia.trim() !== ''
        ? body.emailCopia.trim()
        : null;

    if (!RUC_PATTERN.test(body.ruc.trim())) {
      return buildError(
        'VALIDATION_ERROR',
        '"ruc" must match /^\\d{8,11}$/ (RUC o DNI)',
        400,
      );
    }
    if (!esClaveDirectorioValida(body.ruc, razonSocial)) {
      return buildError(
        'VALIDATION_ERROR',
        '"razonSocial" es la clave genérica CLIENTE SIN NOMBRE: el contacto no se memoriza',
        400,
      );
    }
    if (!EMAIL_PATTERN.test(emailPrincipal)) {
      return buildError('VALIDATION_ERROR', '"emailPrincipal" must be a valid email', 400);
    }
    if (emailCopia !== null && !EMAIL_PATTERN.test(emailCopia)) {
      return buildError('VALIDATION_ERROR', '"emailCopia" must be a valid email when present', 400);
    }

    // OQ1/D1: the JWT carries `nombre` only; 'sistema' is defensive —
    // the proxy already guarantees a session on this protected route.
    const session = await getSession();
    const updatedBy = session?.nombre?.trim() || 'sistema';

    const repo = await getContactDb();
    const contacto = await repo.upsert({
      ruc: body.ruc.trim(),
      razonSocial,
      emailPrincipal,
      emailCopia,
      updatedBy,
    });

    return NextResponse.json({ success: true, contacto });
  } catch (error) {
    if (error instanceof ContactConflictError) {
      return buildError('CONFLICT_ERROR', error.message, 409);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('cobranza contactos PUT route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
