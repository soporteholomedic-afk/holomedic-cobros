import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { GuardarConfigAgenteUseCase } from '@/features/crm/application/guardarConfigAgente';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';

/**
 * `PUT /api/crm/configuracion/agente/kill-switch` (agente-ia-crm E5·T4,
 * permiso `crm_configuracion`): body `{habilitado: boolean}` — STRICT
 * boolean (strings/numbers are 400). The change is audited by the
 * repo with the session user, and bites on the agent's next run.
 */

interface KillSwitchSuccess {
  success: true;
  habilitado: boolean;
}

export async function PUT(
  request: Request,
): Promise<NextResponse<KillSwitchSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_configuracion')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const db = await getCrmDb();
    if (!db.config) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const cuerpo: unknown = await request.json().catch(() => null);
    const habilitado =
      typeof cuerpo === 'object' && cuerpo !== null
        ? (cuerpo as { habilitado?: unknown }).habilitado
        : undefined;
    if (typeof habilitado !== 'boolean') {
      return buildCrmError('VALIDATION_ERROR', '"habilitado" debe ser booleano', 400);
    }

    const config = await new GuardarConfigAgenteUseCase({ config: db.config }).alternarKillSwitch(
      habilitado,
      session.nombre,
    );
    return NextResponse.json({ success: true, habilitado: config.habilitado });
  } catch (error) {
    return mapCrmError('crm configuracion agente kill-switch PUT', error);
  }
}
