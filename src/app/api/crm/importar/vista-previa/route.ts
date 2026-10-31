import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { evaluarImportacion } from '@/features/crm/application/importarEmpresas';
import { leerExcelEmpresas } from '@/features/crm/infrastructure/excel/leerExcelEmpresas';
import { leerArchivoSubido } from '../../_lib/archivo';
import { errorDeCrm, exigirCrm } from '../../_lib/http';

/** Read the uploaded Excel and label every row. Writes nothing. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const filas = await leerExcelEmpresas(await leerArchivoSubido(request));
    const repo = await getCrmDb();
    const { filas: evaluadas, resumen } = await evaluarImportacion(filas, repo);
    return NextResponse.json({ success: true, filas: evaluadas, resumen });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/importar/vista-previa', 'Error al revisar el archivo');
  }
}
