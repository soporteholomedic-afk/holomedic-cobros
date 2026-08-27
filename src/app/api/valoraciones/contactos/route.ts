import { NextResponse } from 'next/server';

import { RUC_PATTERN, type EmpresaContacto } from '@/features/cobranza/domain/entities';
import { getContactDb } from '@/features/cobranza/infrastructure/getContactDb';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';

/**
 * GET /api/valoraciones/contactos?codCli= (REQ-03 M-R3, design D5)
 *
 * Thin recipient-prefill endpoint under the `/api/valoraciones` prefix.
 * The proxy enforces exactly one permiso per route prefix, so valoraciones
 * operators (permiso `valoraciones`) cannot ride `/api/cobranza/contactos`
 * (permiso `cobranza`) — this route re-exposes the SAME REQ-01 contact
 * directory without widening the cobranza route's audience.
 *
 * Flow: `Cliente.NroRuc` by `codCli` (`buscarClientePorCodigo`, SIGLA
 * read-only pool) → `getContactDb().getByRuc()` (HOLOMEDIC directory).
 *
 * Responses:
 *  - 200 `{success: true, nroRuc, contacto}` — `nroRuc`/`contacto` are
 *    `null` when the client is unknown, has no valid RUC (DNI-keyed
 *    particulares degrade to manual entry — NOT an error, spec M-R3) or
 *    the directory misses (REQ-01 empty-prefill state).
 *  - 400 `VALIDATION_ERROR` — missing/non-numeric/`<= 0` `codCli`.
 *  - 500 `INTERNAL_ERROR` — user-safe message, no internals.
 */

// ---- Response types ----

interface ContactosSuccess {
  success: true;
  /** The client's RUC, or null when unknown/invalid (manual entry). */
  nroRuc: string | null;
  /** The memorized REQ-01 contact pair, or null (empty prefill). */
  contacto: EmpresaContacto | null;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = ContactosSuccess | ErrorResponse;

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- GET handler ----

export async function GET(request: Request): Promise<NextResponse<GetResponse>> {
  try {
    const url = new URL(request.url);
    const codCliRaw = url.searchParams.get('codCli');

    if (codCliRaw === null || codCliRaw.trim() === '') {
      return buildError('VALIDATION_ERROR', '"codCli" query parameter is required', 400);
    }
    const codCli = Number(codCliRaw);
    if (!Number.isInteger(codCli) || codCli <= 0) {
      return buildError(
        'VALIDATION_ERROR',
        '"codCli" must be a positive integer (client code)',
        400,
      );
    }

    // RUC source: Cliente.NroRuc by CodCli (spec M-R3 / OQ-3).
    const valoracionesRepo = await getValoracionesDb();
    const cliente = await valoracionesRepo.buscarClientePorCodigo(codCli);

    // DNI-keyed particulares (or junk RUCs) have no directory key — degrade
    // to manual entry without touching the directory.
    const nroRuc =
      cliente?.nroRuc !== undefined &&
      cliente?.nroRuc !== null &&
      RUC_PATTERN.test(cliente.nroRuc)
        ? cliente.nroRuc
        : null;
    if (nroRuc === null) {
      return NextResponse.json({ success: true, nroRuc: null, contacto: null });
    }

    const contactRepo = await getContactDb();
    const contacto = await contactRepo.getByRuc(nroRuc);

    return NextResponse.json({ success: true, nroRuc, contacto });
  } catch (error) {
    // User-safe message — never expose hosts, logins or driver details.
    console.error('valoraciones contactos route error:', error);
    return buildError(
      'INTERNAL_ERROR',
      'Error al consultar los contactos. Intente nuevamente.',
      500,
    );
  }
}
