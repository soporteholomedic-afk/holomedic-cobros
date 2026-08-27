import { NextResponse } from 'next/server';

import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import { parseFiltroDto } from '@/features/valoraciones/domain/parseFiltroDto';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import {
  nombrePdf,
  renderValoracionesPdf,
} from '@/features/valoraciones/infrastructure/pdf/renderValoracionesPdf';

/**
 * POST /api/valoraciones/pdf (REQ-03 E-R1/E-R2, slice 2)
 *
 * Re-executes the SIGLA query from the posted filter DTO (design D4 —
 * tamper-proof: attachments regenerate from the source, never from
 * client-held rows) and prints the membretado A4 document through the
 * shared `renderValoracionesPdf` (the single truth shared with the email
 * attachment flow, spike-2.0 footer numbering included).
 *
 * Body: the `ValoracionesFilter` JSON (fecIni/fecFin/codMon required).
 * Edge unavailable → 502 (user-safe, no stack); other failures → 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { filtro, error } = parseFiltroDto(body);
    if (error || !filtro) {
      return NextResponse.json({ error: error ?? 'Solicitud inválida' }, { status: 400 });
    }

    const repo = await getValoracionesDb();
    const pdf = await renderValoracionesPdf(repo, filtro);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${nombrePdf(filtro)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof EdgeUnavailableError) {
      // E-R2 scenario: user-safe 502, no stack/internals leakage.
      return NextResponse.json(
        { error: 'El generador de PDF no está disponible en este servidor. Contacte al administrador.' },
        { status: 502 },
      );
    }
    // User-safe message — never expose raw DB/browser errors.
    console.error('valoraciones pdf route error:', error);
    return NextResponse.json(
      { error: 'Error al generar el PDF. Intente nuevamente.' },
      { status: 500 },
    );
  }
}
