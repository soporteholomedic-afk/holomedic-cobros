import { NextResponse } from 'next/server';
import { getCrmDb, getCrmOportunidadesDb } from '@/features/crm/infrastructure/getCrmDb';
import { calcularAlertas, resumenDeAlertas } from '@/features/crm/application/calcularAlertas';
import { hoyEnLima } from '@/features/crm/application/validar';
import { errorDeCrm, usuarioCrm } from '../_lib/http';

/**
 * GET /api/crm/alertas — pending-work alerts of the CRM board, computed live
 * from the stored oportunidades joined with their empresas (crm-notificaciones
 * S3/S4, rebased on the oportunidad model: no notification table). Vencidas
 * first, then due today, then inbound waiting >= 48 h; every alert carries
 * the deal AND its empresa so the UI can link into both.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sesion = await usuarioCrm();
    if ('denegado' in sesion) return sesion.denegado;

    const [repo, oportunidadesRepo] = await Promise.all([getCrmDb(), getCrmOportunidadesDb()]);
    const [empresas, oportunidades] = await Promise.all([repo.list(), oportunidadesRepo.list()]);
    const alertas = calcularAlertas(oportunidades, empresas, hoyEnLima(), new Date());
    return NextResponse.json({ success: true, alertas, resumen: resumenDeAlertas(alertas) });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/alertas', 'Error al calcular las alertas del CRM');
  }
}
