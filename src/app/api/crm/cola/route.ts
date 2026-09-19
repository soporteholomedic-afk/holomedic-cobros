import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarColaHoyUseCase } from '@/features/crm/application/listarColaHoy';
import type { ColaHoy } from '@/features/crm/application/listarColaHoy';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `/api/crm/cola` (permiso `crm`, tasks pr13/WU3) — the daily queue
 * "a quién le toca hoy", derived on request (design §3: zero
 * background jobs, no auto-send). Four sections, pr12 predicates:
 * vencidasHoy / reinicios / decisionRequerida / reactivables. Not
 * scoped per user in v1 (spec G4 team tool; cartera owns scoping in
 * pr15).
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface ColaSuccess extends ColaHoy {
  success: true;
}

export async function GET(): Promise<NextResponse<ColaSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { pipeline } = await getCrmDb();
    const cola = await new ListarColaHoyUseCase(pipeline, () => new Date()).execute();
    return NextResponse.json({ success: true, ...cola });
  } catch (error) {
    return mapCrmError('crm cola GET', error);
  }
}
