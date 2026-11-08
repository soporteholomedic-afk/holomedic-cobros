import { NextResponse } from 'next/server';
import { getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { MoverOportunidadUseCase } from '@/features/crm/application/moverOportunidad';
import type { MotivoDatos } from '@/features/crm/domain/entities';
import { buildError, esCambioEtapa, errorDeCrm, exigirCrm, leerJson } from '../../../_lib/http';

/**
 * Move ONE oportunidad to another stage; `medio` and `motivo` travel with
 * the move (MotivoDialog / MedioDialog). `medioOtro` is accepted for form
 * symmetry but a move never stores it: "otro" is rejected in moves, only
 * the activity flow can pick it.
 */
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
    if (!esCambioEtapa(body)) {
      return buildError('Cuerpo inválido. Requiere: {etapa, medio?, motivo?}', 400);
    }

    const repo = await getCrmOportunidadesDb();
    const oportunidad = await new MoverOportunidadUseCase(repo).execute(id, body.etapa as string, {
      medio: body.medio as string | null | undefined,
      motivo: body.motivo as MotivoDatos | null | undefined,
    });
    return NextResponse.json({ success: true, oportunidad });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/oportunidades/[id]/etapa', 'Error al mover la oportunidad');
  }
}
