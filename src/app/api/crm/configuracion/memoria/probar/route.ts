import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { probarMemoria, resolverConfigMemoria } from '@/features/crm/application/configMemoria';
import type { ResultadoProbe } from '@/features/crm/application/configCanalKapso';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';

/**
 * `POST /api/crm/configuracion/memoria/probar` (agente-ia-crm E5·T5a): checks
 * the Engram connection with the CURRENTLY RESOLVED config (no body secrets).
 * 200 `{success, ok, detalle}`; `detalle` is a short generic message.
 */

interface ProbarSuccess extends ResultadoProbe {
  success: true;
}

export async function POST(): Promise<NextResponse<ProbarSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const config = await resolverConfigMemoria({ config: db.config });
    const resultado = await probarMemoria(config);
    return NextResponse.json(
      { success: true as const, ok: resultado.ok, detalle: resultado.detalle },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return mapCrmError('crm configuracion memoria probar POST', error);
  }
}
