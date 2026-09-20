import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { DevolverEmpresaUseCase } from '@/features/crm/application/devolverEmpresa';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/devolver` — return an assigned empresa to the
 * pool (tasks pr14/WU3, spec G5, design D2). The CURRENT OWNER may give
 * it back with plain `crm`; any other actor needs `crm_admin` checked
 * IN-ROUTE (design D2: "devolver propia" is a plain-crm operation while
 * assignment itself is admin-only). The owner UPDATE + the DEVUELTO
 * audit INSERT land in ONE transaction inside the use case.
 *
 * Identity resolution (verify remediation for tasks risks 17/18 — the
 * pr15 cartera canonical pattern): `session.sub` carries the opaque
 * auth ID (dbo.usuarios.idUsuario) while `CRM_Empresas.responsable`
 * stores the login username (dbo.usuarios.usuario). The route resolves
 * sub → usuario ONCE via the auth module's own container
 * (`getUsuarioDb().getById(sub)`; single PK lookup, no new identity
 * scheme) and matches the owner against the RESOLVED login name. A
 * session whose user row no longer exists gets 401 — ownership cannot
 * be established without a verified username.
 */

interface DevolverSuccess {
  success: true;
  accion: 'DEVUELTO';
  responsablePrevio: string;
}

function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DevolverSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parseEmpresaId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    // Canonical idUsuario → usuario resolution (pr15 cartera precedent).
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

    const { empresas, asignaciones } = await getCrmDb();
    const empresa = await empresas.obtenerPorId(id);
    if (!empresa) {
      return buildCrmError('NOT_FOUND_ERROR', 'Empresa no encontrada', 404);
    }

    const esAdmin = session.permisos.includes('crm_admin');
    const esOwner = empresa.responsable !== null && usuario === empresa.responsable;
    if (!esOwner && !esAdmin) {
      return buildCrmError(
        'FORBIDDEN',
        'Solo el responsable asignado o un usuario crm_admin puede devolver la empresa al pool',
        403,
      );
    }

    const resultado = await new DevolverEmpresaUseCase(empresas, asignaciones).execute({
      empresaId: id,
      usuario: session.sub,
      // The route pre-authorized the actor (owner-or-admin 403 above);
      // the use case's own usuario===responsable guard cannot see the
      // ID↔username mapping, so the authorization travels as esAdmin.
      esAdmin: esAdmin || esOwner,
    });
    return NextResponse.json({
      success: true,
      accion: resultado.accion,
      responsablePrevio: resultado.responsablePrevio,
    } satisfies DevolverSuccess);
  } catch (error) {
    return mapCrmError('crm empresas [id] devolver POST', error);
  }
}
