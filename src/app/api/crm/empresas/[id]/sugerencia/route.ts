import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ResolverSugerenciaUseCase } from '@/features/crm/application/resolverSugerencia';
import { buildError, errorDeCrm, esObjeto, exigirCrm, leerJson } from '../../../_lib/http';

/** Answer the "N intentos sin respuesta" suggestion: `perder` or `seguir`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { id } = await params;
    const body = await leerJson(request);
    if (body === undefined) return buildError('El cuerpo debe ser JSON válido', 400);
    if (!esObjeto(body) || typeof body.accion !== 'string') {
      return buildError("Cuerpo inválido. Requiere: {accion: 'perder' | 'seguir'}", 400);
    }

    const repo = await getCrmDb();
    const empresa = await new ResolverSugerenciaUseCase(repo).execute(id, body.accion);
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return errorDeCrm(error, 'POST /api/crm/empresas/[id]/sugerencia', 'Error al resolver la sugerencia');
  }
}
