import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { GetOwnFirmaUseCase } from '@/features/firma-correo/application/getOwnFirma';
import { SaveOwnFirmaUseCase } from '@/features/firma-correo/application/saveOwnFirma';
import type { FirmaCorreo } from '@/features/firma-correo/domain/entities';
import { composeSignatureHtml } from '@/features/firma-correo/domain/composeSignatureHtml';
import { getFirmaDb } from '@/features/firma-correo/infrastructure/getFirmaDb';

// ---- Response types ----

interface FirmaSuccess {
  success: true;
  firma: FirmaCorreo | null;
  /** SERVER-composed email-safe block ('' when no signature exists). */
  firmaHtml: string;
}

type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  fields?: Record<string, string>;
}

type GetResponse = FirmaSuccess | ErrorResponse;
type PutResponse = FirmaSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(
  code: ErrorCode,
  error: string,
  status: number,
  fields?: Record<string, string>,
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code, fields }, { status });
}

/**
 * Guard for the PUT body. Two roles:
 *
 *  1. Shape: `nombre`, `area`, `correo` are required strings;
 *     `telefono`/`anexo` are optional strings (absent → '').
 *  2. Threat TM5: a body carrying `firma` or `firmaHtml` is REJECTED —
 *     there is no client-supplied signature-HTML surface. The block is
 *     composed SERVER-SIDE from the validated stored fields via the
 *     pure `composeSignatureHtml`, so a caller can never inject markup.
 *
 * Any other extra key (e.g. a client-supplied `ownerId`) is ignored —
 * it is not forwarded; the persisted row owner is always `session.sub`
 * (threat TM4).
 */
function parseFirmaBody(
  v: unknown,
): { ok: true; input: Omit<FirmaCorreo, never> } | { ok: false; error: string } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return { ok: false, error: 'El cuerpo debe ser un objeto JSON' };
  }
  const obj = v as Record<string, unknown>;
  if ('firma' in obj || 'firmaHtml' in obj) {
    return {
      ok: false,
      error: '"firma"/"firmaHtml" son calculados por el servidor y no pueden enviarse',
    };
  }
  if (typeof obj.nombre !== 'string' || typeof obj.area !== 'string' || typeof obj.correo !== 'string') {
    return { ok: false, error: 'El cuerpo requiere {nombre, area, correo} como texto' };
  }
  if (obj.telefono !== undefined && typeof obj.telefono !== 'string') {
    return { ok: false, error: '"telefono" debe ser texto' };
  }
  if (obj.anexo !== undefined && typeof obj.anexo !== 'string') {
    return { ok: false, error: '"anexo" debe ser texto' };
  }
  return {
    ok: true,
    input: {
      nombre: obj.nombre,
      area: obj.area,
      correo: obj.correo,
      telefono: obj.telefono ?? '',
      anexo: obj.anexo ?? '',
    },
  };
}

/**
 * In-route auth check (defense-in-depth alongside the proxy entry —
 * the /api/usuarios precedent). Returns either the session or a ready
 * error response:
 *  - no session → 401 JSON (threat TM1 — an API answers with status
 *    codes, never login redirects);
 *  - session without the `firma_correo` permiso → 403 JSON (TM2).
 */
async function requireFirmaSession(): Promise<
  { session: { sub: string; permisos: string[] }; error?: undefined } | { session?: undefined; error: NextResponse<ErrorResponse> }
> {
  const session = await getSession();
  if (!session) {
    return { error: buildError('UNAUTHORIZED', 'No autenticado', 401) };
  }
  if (!session.permisos.includes('firma_correo')) {
    return { error: buildError('FORBIDDEN', 'No tenés el permiso "firma_correo"', 403) };
  }
  return { session };
}

// ---- GET handler ----

/**
 * GET /api/plantillas/firma — the caller's OWN signature.
 *
 * Reads the row keyed by `ownerId = session.sub` under the reserved
 * signature area and composes `firmaHtml` SERVER-SIDE with the same
 * pure function the form preview and the send paths use (one function
 * = preview === send output). No stored signature →
 * `{ success: true, firma: null, firmaHtml: '' }` — the empty-string
 * contract is resolved downstream by the send-path token resolver
 * fallback; this route adds no fallback markup itself.
 */
export async function GET(_request: Request): Promise<NextResponse<GetResponse>> {
  try {
    const auth = await requireFirmaSession();
    if (auth.error) return auth.error;

    const repo = await getFirmaDb();
    const useCase = new GetOwnFirmaUseCase(repo);
    const firma = await useCase.execute(auth.session.sub);

    return NextResponse.json({
      success: true,
      firma,
      firmaHtml: firma ? composeSignatureHtml(firma) : '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas firma GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}

// ---- PUT handler ----

/**
 * PUT /api/plantillas/firma — save the caller's OWN signature.
 *
 * The body carries the five plain fields (no HTML, no ids — see the
 * body guard). Validation + persistence go through
 * `SaveOwnFirmaUseCase` with `ownerId = session.sub` FORCED server-side
 * (own-row-only by construction, TM4). Valid → 200 with the persisted
 * (trimmed) values + freshly composed `firmaHtml`. Invalid → 400 with
 * per-field `fields`; storage failure → 500.
 */
export async function PUT(request: Request): Promise<NextResponse<PutResponse>> {
  try {
    const auth = await requireFirmaSession();
    if (auth.error) return auth.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    const parsed = parseFirmaBody(body);
    if (!parsed.ok) {
      return buildError('VALIDATION_ERROR', parsed.error, 400);
    }

    const repo = await getFirmaDb();
    const useCase = new SaveOwnFirmaUseCase(repo);
    const result = await useCase.execute(auth.session.sub, parsed.input);
    if (!result.ok) {
      return buildError(
        'VALIDATION_ERROR',
        'La firma contiene campos inválidos',
        400,
        result.fields,
      );
    }

    return NextResponse.json({
      success: true,
      firma: result.value,
      firmaHtml: composeSignatureHtml(result.value),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas firma PUT route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
