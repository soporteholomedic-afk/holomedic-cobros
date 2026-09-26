import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarColaHoyUseCase } from '@/features/crm/application/listarColaHoy';
import type { ColaHoy } from '@/features/crm/application/listarColaHoy';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `/api/crm/cola` (permiso `crm`, tasks pr13/WU3) — the daily queue
 * "a quién le toca hoy", derived on request (design §3: zero
 * background jobs, no auto-send). Four team-wide sections, pr12
 * predicates: vencidasHoy / reinicios / decisionRequerida /
 * reactivables; plus the crm-ux redesign fifth column (sinGestion),
 * scoped to the session user's fresh empresas.
 *
 * Identity (cartera route precedent): `session.sub` is the opaque
 * idUsuario while the sinGestion scope needs the LOGIN NAME
 * (dbo.usuarios.usuario — the currency CRM_Empresas.responsable
 * stores); resolved ONCE per request via a single PK lookup.
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

    // Canonical idUsuario → usuario resolution (auth module precedent).
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    const usuario = filaUsuario?.usuario ?? null;
    if (usuario === null) {
      return buildCrmError('UNAUTHORIZED', 'La sesión ya no corresponde a un usuario válido', 401);
    }

    const { pipeline } = await getCrmDb();
    const cola = await new ListarColaHoyUseCase(pipeline, () => new Date()).execute(usuario);
    return NextResponse.json({ success: true, ...cola });
  } catch (error) {
    return mapCrmError('crm cola GET', error);
  }
}
