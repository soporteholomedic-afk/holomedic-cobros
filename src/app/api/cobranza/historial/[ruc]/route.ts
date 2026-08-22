import { NextResponse } from 'next/server';

import { RUC_PATTERN } from '@/features/cobranza/domain/entities';
import { getCobranzaHistorialDb } from '@/features/cobranza/infrastructure/getCobranzaHistorialDb';

/**
 * GET /api/cobranza/historial/[ruc] — the per-client audit history
 * for the cobranza communication log (REQ-02).
 *
 * Envelope semantics (envios/[id] mirror):
 *  - 400 `{success:false, error, code:'VALIDATION_ERROR'}` when the
 *    trimmed key is not an 8–11 digit RUC/DNI (junk Excel keys are
 *    write-only in the audit log; the client gates them to a
 *    'skipped' state so this path is defense in depth).
 *  - 200 `{success:true, envios: CobranzaEnvioHistorial[]}` — an
 *    empty array is a VALID "no sends yet" state, not 404 (no
 *    server-side client master exists to 404 against; the contactos
 *    precedent answers unknown keys with 200). Rows arrive
 *    most-recent-first from the repo WITHOUT the cuerpoResumen LOB.
 *  - 500 `{success:false, error, code:'INTERNAL_ERROR'}` catch-all.
 *
 * Protected via the `/api/cobranza/historial` RUTAS_PROTEGIDAS entry
 * (`startsWith` covers the `[ruc]` subpath — design §3.4/D1).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ruc: string }> },
): Promise<NextResponse> {
  try {
    const { ruc } = await params;
    const key = ruc.trim();
    if (!RUC_PATTERN.test(key)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid ruc: "${ruc}" — expected 8 to 11 digits`,
          code: 'VALIDATION_ERROR',
        },
        { status: 400 },
      );
    }
    const repo = await getCobranzaHistorialDb();
    const envios = await repo.getByRuc(key);
    return NextResponse.json({ success: true, envios });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('cobranza historial route error:', error);
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
