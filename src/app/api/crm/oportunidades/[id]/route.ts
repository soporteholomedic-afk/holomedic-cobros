import { NextResponse } from 'next/server';
import { getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { EditarOportunidadUseCase, type EditarOportunidadDatos } from '@/features/crm/application/editarOportunidad';
import { buildError, esDatosOportunidad, errorDeCrm, exigirCrm, leerJson } from '../../_lib/http';

/** Edit the data of one oportunidad (name, responsable, origen, service, amount) — the stage has its own route. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { id } = await params;
    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esDatosOportunidad(body)) {
      return buildError('Cuerpo inválido. Requiere: {nombre}', 400);
    }

    const repo = await getCrmOportunidadesDb();
    const oportunidad = await new EditarOportunidadUseCase(repo).execute(id, body as unknown as EditarOportunidadDatos);
    return NextResponse.json({ success: true, oportunidad });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/oportunidades/[id]', 'Error al guardar la oportunidad');
  }
}
