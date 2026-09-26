import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { AsignacionHistorial } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * GET /api/crm/empresas/[id]/asignaciones — the per-empresa assignment
 * history (tasks pr15/WU2, spec G5 traceability: every assign,
 * reassign and return event with actor and timestamp, newest first).
 *
 * Reads are open to any `crm` holder — the detail-route precedent (the
 * detail endpoint already exposes transiciones/handoffs to `crm`);
 * assignment WRITES stay gated by pr14's admin/owner routes. 404 when
 * the empresa does not exist. Errors: typed `CrmErrorResponse` codes.
 */

interface AsignacionesSuccess {
  success: true;
  asignaciones: AsignacionHistorial[];
}

function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<AsignacionesSuccess | CrmErrorResponse>> {
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

    const historial = await asignaciones.listarAsignaciones(id);
    return NextResponse.json({ success: true, asignaciones: historial });
  } catch (error) {
    return mapCrmError('crm empresas [id] asignaciones GET', error);
  }
}
