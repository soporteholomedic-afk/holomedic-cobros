import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { CrearSectorUseCase, ListarSectoresUseCase } from '@/features/crm/application/sectores';
import { buildError, errorDeCrm, esObjeto, exigirCrm, leerJson } from '../_lib/http';

export async function GET(): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const repo = await getCrmDb();
    const sectores = await new ListarSectoresUseCase(repo).execute();
    return NextResponse.json({ success: true, sectores });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/sectores', 'Error al listar sectores');
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esObjeto(body) || typeof body.nombre !== 'string') {
      return buildError('Cuerpo inválido. Requiere: {nombre}', 400);
    }

    const repo = await getCrmDb();
    const sector = await new CrearSectorUseCase(repo).execute(body.nombre);
    return NextResponse.json({ success: true, sector }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/sectores', 'Error al crear el sector');
  }
}
