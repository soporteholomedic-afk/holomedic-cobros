import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { AsignarEmpresaUseCase } from '@/features/crm/application/asignarEmpresa';
import type { ResultadoAsignacion } from '@/features/crm/application/asignarEmpresa';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/asignar` — assign or reassign ONE empresa to
 * ONE user (tasks pr14/WU3, spec G5, design D2). The derived event is
 * ASIGNADO when the empresa comes from the pool and REASIGNADO when it
 * had an owner; the owner UPDATE + the audit INSERT land in ONE
 * transaction inside the use case (through the asignaciones port).
 *
 * Permiso: `crm` at the route prefix PLUS the in-route split (design
 * D2 — prefix matching cannot split by HTTP method):
 * - `crm_admin`: unrestricted assignment/reassignment (PanelAsignacion).
 * - plain `crm` (crm-ux redesign self-claim): may claim any empresa
 *   for THEMSELVES — pool (ASIGNADO) or owned by someone else
 *   (REASIGNADO; the UI asks for confirmation in that case and the
 *   audit trail records the actor). Assigning to someone else stays
 *   crm_admin territory.
 */

interface AsignarSuccess {
  success: true;
  accion: ResultadoAsignacion['accion'];
  responsable: string;
  responsablePrevio: string | null;
}

function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<AsignarSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }
    const esAdmin = session.permisos.includes('crm_admin');

    const { id: rawId } = await ctx.params;
    const id = parseEmpresaId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    const responsable =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).responsable
        : undefined;
    if (typeof responsable !== 'string' || responsable.trim() === '') {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {responsable: "<usuario>"}',
        400,
      );
    }

    const { empresas, asignaciones } = await getCrmDb();

    // Canonical idUsuario → usuario resolution (cartera route
    // precedent): the self-claim guard compares against the LOGIN
    // NAME — the currency `responsable` stores — never the opaque sub.
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    const usuarioSesion = filaUsuario?.usuario ?? null;
    if (usuarioSesion === null) {
      return buildCrmError('UNAUTHORIZED', 'La sesión ya no corresponde a un usuario válido', 401);
    }

    // Self-claim guard (crm-ux redesign): a plain `crm` holder claims
    // for THEMSELVES only — a foreign responsable is admin territory
    // (PanelAsignacion). Pool vs owned is derived by the use case
    // (ASIGNADO / REASIGNADO) and audited with the acting user.
    if (!esAdmin && responsable !== usuarioSesion) {
      return buildCrmError('FORBIDDEN', 'Solo puedes asignar empresas a tu propio usuario', 403);
    }

    const resultado = await new AsignarEmpresaUseCase(empresas, asignaciones).execute({
      empresaId: id,
      responsable,
      usuario: session.sub,
    });
    return NextResponse.json({
      success: true,
      accion: resultado.accion,
      responsable: resultado.responsableNuevo,
      responsablePrevio: resultado.responsablePrevio,
    } satisfies AsignarSuccess);
  } catch (error) {
    return mapCrmError('crm empresas [id] asignar POST', error);
  }
}
