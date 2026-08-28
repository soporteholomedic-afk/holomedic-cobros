import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { nombreEmpresa } from '@/features/valoraciones/domain/agrupacion';
import { parseExportFiltroDto } from '@/features/valoraciones/domain/parseFiltroDto';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import { generarFormato35Workbook } from '@/features/valoraciones/infrastructure/excel/formato35';
import { dispositionAttachment, nombreArchivoExportacion } from '@/features/valoraciones/infrastructure/filename';

/**
 * POST /api/valoraciones/excel (REQ-03 E-R3, slice 2; U6 per-empresa
 * download)
 *
 * Re-executes the SIGLA query from the posted filter DTO (design D4),
 * optionally scoped to one empresa group key (U6: `empresa` in the body —
 * the per-row buttons export ONLY their row), and streams a Formato 35
 * `.xlsx` (30 standard columns UNCHANGED, moneda-aware total) with a
 * download `Content-Disposition` named `[NombreEmpresa]_[fecIni].xlsx`
 * (legacy `valoraciones_…` for clientless exports). Failures → user-safe
 * 500.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json().catch(() => null);
    const { filtro, empresa, error } = parseExportFiltroDto(body);
    if (error || !filtro) {
      return NextResponse.json({ error: error ?? 'Solicitud inválida' }, { status: 400 });
    }

    const repo = await getValoracionesDb();
    const todas = await repo.buscarValoraciones(filtro);
    const rows =
      empresa === undefined ? todas : todas.filter((row) => nombreEmpresa(row) === empresa);

    const workbook = generarFormato35Workbook(rows, filtro.codMon);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const nombre = nombreArchivoExportacion(empresa, filtro.fecIni, 'xlsx', filtro.fecFin);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': dispositionAttachment(nombre),
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
