import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { parseFiltroDto } from '@/features/valoraciones/domain/parseFiltroDto';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import { generarFormato35Workbook } from '@/features/valoraciones/infrastructure/excel/formato35';

/**
 * POST /api/valoraciones/excel (REQ-03 E-R3, slice 2)
 *
 * Re-executes the SIGLA query from the posted filter DTO (design D4) and
 * streams a Formato 35 `.xlsx` (30 standard columns, moneda-aware total)
 * with a download `Content-Disposition`. Failures → user-safe 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { filtro, error } = parseFiltroDto(body);
    if (error || !filtro) {
      return NextResponse.json({ error: error ?? 'Solicitud inválida' }, { status: 400 });
    }

    const repo = await getValoracionesDb();
    const rows = await repo.buscarValoraciones(filtro);

    const workbook = generarFormato35Workbook(rows, filtro.codMon);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const nombre = `valoraciones_${filtro.fecIni}_${filtro.fecFin}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${nombre}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    // User-safe message — never expose raw DB errors or SP names.
    console.error('valoraciones excel route error:', error);
    return NextResponse.json(
      { error: 'Error al generar el Excel. Intente nuevamente.' },
      { status: 500 },
    );
  }
}
