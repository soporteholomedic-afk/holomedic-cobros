import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ImportarEmpresasUseCase } from '@/features/crm/application/importarEmpresas';
import { leerExcelEmpresas } from '@/features/crm/infrastructure/excel/leerExcelEmpresas';
import { leerArchivoSubido } from '../_lib/archivo';
import { errorDeCrm, exigirCrm } from '../_lib/http';

/**
 * Import the Excel. The file is read and checked again here: nothing the
 * client says about its rows is trusted, only the uploaded bytes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const filas = await leerExcelEmpresas(await leerArchivoSubido(request));
    const repo = await getCrmDb();
    const resultado = await new ImportarEmpresasUseCase(repo).execute(filas);
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/importar', 'Error al importar las empresas');
  }
}
