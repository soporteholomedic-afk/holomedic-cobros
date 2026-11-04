import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { MoverEmpresaUseCase } from '@/features/crm/application/moverEmpresa';
import type { MotivoDatos } from '@/features/crm/domain/entities';
import {
  buildError,
  errorDeCrm,
  esMotivo,
  esObjeto,
  exigirCrm,
  leerJson,
} from '../../../_lib/http';

/** Move an empresa to another column; `medio` and `motivo` travel with the move. */
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
    if (
      !esObjeto(body) ||
      typeof body.etapa !== 'string' ||
      !(body.medio === undefined || body.medio === null || typeof body.medio === 'string') ||
      !(body.motivo === undefined || body.motivo === null || esMotivo(body.motivo))
    ) {
      return buildError('Cuerpo inválido. Requiere: {etapa, medio?, motivo?}', 400);
    }

    const repo = await getCrmDb();
    const empresa = await new MoverEmpresaUseCase(repo).execute(id, body.etapa, {
      medio: body.medio as string | null | undefined,
      motivo: body.motivo as MotivoDatos | null | undefined,
    });
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/empresas/[id]/etapa', 'Error al mover la empresa');
  }
}
