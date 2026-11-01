import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { CompletarRucUseCase } from '@/features/crm/application/completarRuc';
import { buildError, errorDeCrm, esObjeto, exigirCrm, leerJson } from '../../../_lib/http';

/** Add the RUC to a card; `unir: true` confirms merging into the empresa that already holds it. */
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
      typeof body.ruc !== 'string' ||
      !(body.unir === undefined || typeof body.unir === 'boolean')
    ) {
      return buildError('Cuerpo inválido. Requiere: {ruc, unir?}', 400);
    }

    const repo = await getCrmDb();
    const empresa = await new CompletarRucUseCase(repo).execute(id, body.ruc, { unir: body.unir === true });
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'PATCH /api/crm/empresas/[id]/ruc', 'Error al guardar el RUC');
  }
}
