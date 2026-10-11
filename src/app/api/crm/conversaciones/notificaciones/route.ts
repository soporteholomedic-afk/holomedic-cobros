import { NextResponse } from 'next/server';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ObtenerResumenNotificacionesUseCase } from '@/features/crm/application/obtenerResumenNotificaciones';
import type { ResumenNotificaciones } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET /api/crm/conversaciones/notificaciones` (agente-ia-crm E3·T3)
 * — the bandeja badge: counts over CRM_Conversaciones in ONE repo
 * roundtrip. Deliberately NO in-route session/permiso re-check: the
 * proxy already gates the whole /api/crm/conversaciones prefix with
 * `crm_conversaciones` and the payload carries NO session-dependent
 * data (pure aggregate counts) — the read stays cheap and identical
 * for every caller. `no-store` keeps the badge fresh (a cached badge
 * would hide escalations).
 */

interface NotificacionesSuccess extends ResumenNotificaciones {
  success: true;
}

export async function GET(): Promise<NextResponse<NotificacionesSuccess | CrmErrorResponse>> {
  try {
    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();
    return NextResponse.json(
      { success: true, ...resumen } satisfies NotificacionesSuccess,
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapCrmError('crm conversaciones notificaciones GET', error);
  }
}
