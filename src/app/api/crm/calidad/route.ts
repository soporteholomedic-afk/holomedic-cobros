import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { DIAS_VENTANA_CALIDAD, type ResumenCalidad } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `GET /api/crm/calidad` (agente-ia-crm E4·T6) — the quality panel's
 * ONE aggregate (read-only). In-route session + permiso check exactly
 * like /api/crm/productividad (401/403 typed errors): the proxy gates
 * the /api/crm prefix with plain `crm`, so the crm_conversaciones
 * re-check HERE is the real gate for this conversations-tier surface.
 *
 * The 30-day window is FIXED server-side (DIAS_VENTANA_CALIDAD): the
 * API accepts NO window parameter, so the client can never widen the
 * view. `no-store` keeps the metrics live (a cached panel would hide
 * fresh escalations/marcas).
 */

interface CalidadSuccess extends ResumenCalidad {
  success: true;
}

export async function GET(): Promise<NextResponse<CalidadSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { calidad } = await getCrmDb();
    if (!calidad) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const desde = new Date(Date.now() - DIAS_VENTANA_CALIDAD * 24 * 60 * 60 * 1000);
    const resumen = await calidad.obtenerResumen(desde);
    return NextResponse.json(
      { success: true, ...resumen } satisfies CalidadSuccess,
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapCrmError('crm calidad GET', error);
  }
}
