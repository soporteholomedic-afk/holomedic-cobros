import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ActualizarSeguimientoUseCase } from '@/features/crm/application/actualizarSeguimiento';
import type { MotivoDatos } from '@/features/crm/domain/entities';
import {
  buildError,
  errorDeCrm,
  esMotivo,
  esObjeto,
  exigirCrm,
  leerJson,
} from '../../../_lib/http';

/** Edit the contact medium and/or the loss reason without moving the empresa. */
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
    const tocaMedio = esObjeto(body) && 'medio' in body;
    const tocaMotivo = esObjeto(body) && 'motivo' in body;
    if (
      !esObjeto(body) ||
      (!tocaMedio && !tocaMotivo) ||
      (tocaMedio && !(body.medio === null || typeof body.medio === 'string')) ||
      (tocaMotivo && !esMotivo(body.motivo))
    ) {
      return buildError('Cuerpo inválido. Requiere: {medio} y/o {motivo}', 400);
    }

    const repo = await getCrmDb();
    const empresa = await new ActualizarSeguimientoUseCase(repo).execute(id, {
      ...(tocaMedio ? { medio: body.medio as string | null } : {}),
      ...(tocaMotivo ? { motivo: body.motivo as MotivoDatos } : {}),
    });
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/empresas/[id]/seguimiento', 'Error al guardar el seguimiento');
  }
}
