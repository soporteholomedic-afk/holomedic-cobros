import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
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
 * Identity note: `session.sub` carries the auth ID (dbo.usuarios.
 * idUsuario) while `CRM_Empresas.responsable` stores the login username
 * (dbo.usuarios.usuario) — the route contract pins the "u-<usuario>" ID
 * form as the owning session, so the match accepts either notation.
 * pr15 (cartera scoping) owns the canonical idUsuario→usuario
 * resolution; flagged for design review at verify.
 */

interface DevolverSuccess {
  success: true;
  accion: 'DEVUELTO';
  responsablePrevio: string;
}

/**
 * Ownership match between the session identity and the stored owner:
 * accepts the raw username or its "u-"-prefixed auth-ID form.
 */
function esSesionDelResponsable(sub: string, responsable: string): boolean {
  return sub === responsable || sub === `u-${responsable}`;
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

    const { empresas, asignaciones } = await getCrmDb();
    const empresa = await empresas.obtenerPorId(id);
    if (!empresa) {
      return buildCrmError('NOT_FOUND_ERROR', 'Empresa no encontrada', 404);
    }

    const esAdmin = session.permisos.includes('crm_admin');
    const esOwner =
      empresa.responsable !== null && esSesionDelResponsable(session.sub, empresa.responsable);
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
