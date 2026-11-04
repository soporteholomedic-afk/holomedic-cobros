import { NextResponse } from 'next/server';
import { generarPlantillaEmpresas } from '@/features/crm/infrastructure/excel/plantillaEmpresas';
import { errorDeCrm, exigirCrm } from '../../_lib/http';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const libro = await generarPlantillaEmpresas();
    return new NextResponse(new Uint8Array(libro), {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': 'attachment; filename="plantilla-empresas.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/importar/plantilla', 'Error al generar la plantilla');
  }
}
