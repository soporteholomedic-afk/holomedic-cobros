import { NextResponse } from 'next/server';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { calcularAlertas, resumenDeAlertas } from '@/features/crm/application/calcularAlertas';
import { hoyEnLima } from '@/features/crm/application/validar';
import { errorDeCrm, usuarioCrm } from '../_lib/http';

/**
 * GET /api/crm/alertas — pending-work alerts of the CRM board, computed live
 * from the stored empresas (crm-notificaciones S3/S4: no notification table).
 * Vencidas first, then due today, then inbound waiting >= 48 h.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sesion = await usuarioCrm();
    if ('denegado' in sesion) return sesion.denegado;

    const repo = await getCrmDb();
    const empresas = await repo.list();
    const alertas = calcularAlertas(empresas, hoyEnLima(), new Date());
    return NextResponse.json({ success: true, alertas, resumen: resumenDeAlertas(alertas) });
  } catch (error) {
    return errorDeCrm(error, 'GET /api/crm/alertas', 'Error al calcular las alertas del CRM');
  }
}
