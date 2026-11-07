import { NextResponse } from 'next/server';
import { getCrmAtenciones, getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ConsultarAtencionUseCase } from '@/features/crm/application/consultarAtencion';
import { hoyEnLima } from '@/features/crm/application/validar';
import { buildError, errorDeCrm, exigirCrm } from '../../../_lib/http';

/**
 * GET — "Última atención / Actividad de servicios" of the ficha, read LIVE
 * from SIGLA (S8): `{ actividad: { ultimaAtencion, ruc }, estado }`. An
 * unknown empresa is 404; a SIGLA failure is 503 — the CRM itself is up,
 * only the live lookup is not.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const denegado = await exigirCrm();
    if (denegado) return denegado;

    const { id } = await params;
    const [empresas, atenciones] = await Promise.all([getCrmDb(), getCrmAtenciones()]);
    const atencion = await new ConsultarAtencionUseCase(empresas, atenciones).execute(id, hoyEnLima());
    return NextResponse.json(
      { success: true, actividad: atencion.actividad, estado: atencion.estado },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // The only expected domain error is the unknown empresa; anything else is
    // the SIGLA lookup (or the store) failing — reported as 503 with a clear
    // message, never leaking the driver error.
    if (error instanceof Error && error.name === 'EmpresaNotFoundError') {
      return errorDeCrm(error, 'GET /api/crm/empresas/[id]/atencion', 'Error al consultar la última atención');
    }
    console.error('GET /api/crm/empresas/[id]/atencion failed (SIGLA):', error);
    return buildError('No se pudo consultar la última atención en SIGLA', 503);
  }
}
