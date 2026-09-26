import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarCarteraUseCase } from '@/features/crm/application/listarCartera';
import type { FilaCartera } from '@/features/crm/application/listarCartera';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `/api/crm/cartera` (permiso `crm`, tasks pr15/WU1, spec G5 "Cartera
 * views") — the session's cartera, scoped by the resolved LOGIN NAME.
 *
 * Identity resolution (the canonical decision this slice owns, closing
 * pr14's flag for scoping purposes): `session.sub` carries the opaque
 * auth id (dbo.usuarios.idUsuario) while `CRM_Empresas.responsable`
 * stores the login username (dbo.usuarios.usuario) — the JWT payload
 * has no usuario claim, so the route resolves it ONCE per request via
 * the auth module's own container (`getUsuarioDb().getById(sub)`; a
 * single PK lookup, no new identity scheme). A session whose user row
 * no longer exists (deleted after login) gets 401 — the cartera scope
 * cannot be established without a verified username.
 *
 * `?todas=true` widens the scope ONLY for `crm_admin` (in-route flag;
 * the use case re-enforces the policy — a plain holder asking `todas`
 * still gets their own cartera, `todas: false` echoed back).
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface CarteraSuccess {
  success: true;
  filas: FilaCartera[];
  /** Effective scope, echoed for the UI toggle (server truth). */
  todas: boolean;
}

function parseTodas(raw: string | null): boolean | null {
  if (raw === null || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export async function GET(
  request: Request,
): Promise<NextResponse<CarteraSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const todas = parseTodas(new URL(request.url).searchParams.get('todas'));
    if (todas === null) {
      return buildCrmError('VALIDATION_ERROR', '"todas" debe ser "true" o "false"', 400);
    }

    // Canonical idUsuario → usuario resolution (auth module precedent).
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    const usuario = filaUsuario?.usuario ?? null;
    if (usuario === null) {
      return buildCrmError(
        'UNAUTHORIZED',
        'La sesión ya no corresponde a un usuario válido',
        401,
      );
    }

    const esAdmin = session.permisos.includes('crm_admin');
    const { empresas, pipeline } = await getCrmDb();
    const filas = await new ListarCarteraUseCase(empresas, pipeline, () => new Date()).execute({
      usuario,
      esAdmin,
      verTodas: todas,
    });
    return NextResponse.json({ success: true, filas, todas: esAdmin && todas });
  } catch (error) {
    return mapCrmError('crm cartera GET', error);
  }
}
