import { NextResponse } from 'next/server';
import { getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { ActualizarSeguimientoOportunidadUseCase } from '@/features/crm/application/actualizarSeguimiento';
import type { MotivoDatos } from '@/features/crm/domain/entities';
import { buildError, esCambioSeguimiento, errorDeCrm, exigirCrm, leerJson } from '../../../_lib/http';

/** Edit the contact medium and/or the loss reason of ONE oportunidad without moving it. */
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
    if (!esCambioSeguimiento(body)) {
      return buildError('Cuerpo inválido. Requiere: {medio} y/o {motivo}', 400);
    }

    const repo = await getCrmOportunidadesDb();
    const oportunidad = await new ActualizarSeguimientoOportunidadUseCase(repo).execute(id, {
      ...('medio' in body ? { medio: body.medio as string | null } : {}),
      ...('motivo' in body ? { motivo: body.motivo as MotivoDatos } : {}),
    });
    return NextResponse.json({ success: true, oportunidad });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/oportunidades/[id]/seguimiento', 'Error al guardar el seguimiento');
  }
}
