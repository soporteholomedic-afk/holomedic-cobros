import { NextResponse } from 'next/server';
import { getCrmDb, getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarOportunidadesUseCase } from '@/features/crm/application/listarOportunidades';
import { CrearOportunidadUseCase, type CrearOportunidadDatos } from '@/features/crm/application/crearOportunidad';
import { buildError, esNuevaOportunidad, errorDeCrm, exigirCrm, leerJson } from '../_lib/http';

/** All oportunidades of all empresas (the Kanban source), newest first. */
export async function GET(): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const repo = await getCrmOportunidadesDb();
    const oportunidades = await new ListarOportunidadesUseCase(repo).execute();
    return NextResponse.json({ success: true, oportunidades });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/oportunidades', 'Error al listar oportunidades');
  }
}

/** Create one deal of an EXISTING empresa — the ficha is never duplicated. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esNuevaOportunidad(body)) {
      return buildError('Cuerpo inválido. Requiere: {idEmpresa, nombre}', 400);
    }

    const { idEmpresa, ...datos } = body as Record<string, unknown>;
    const [empresas, oportunidades] = await Promise.all([getCrmDb(), getCrmOportunidadesDb()]);
    const oportunidad = await new CrearOportunidadUseCase(empresas, oportunidades).execute(
      idEmpresa as string,
      datos as unknown as CrearOportunidadDatos,
    );
    return NextResponse.json({ success: true, oportunidad }, { status: 201 });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/oportunidades', 'Error al crear la oportunidad');
  }
}
