import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarHistorialUseCase } from '@/features/crm/application/listarHistorial';
import { errorDeCrm, exigirCrm } from '../../../_lib/http';

/** Contact history of an empresa, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { id } = await params;
    const repo = await getCrmDb();
    const interacciones = await new ListarHistorialUseCase(repo).execute(id);
    return NextResponse.json({ success: true, interacciones });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/empresas/[id]/historial', 'Error al leer el historial');
  }
}
