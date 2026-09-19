import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ObtenerDetalleEmpresaUseCase } from '@/features/crm/application/obtenerDetalleEmpresa';
import type { DetalleEmpresa } from '@/features/crm/application/obtenerDetalleEmpresa';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/detalle` (permiso `crm`, tasks pr11/WU1) —
 * the detail page's read model in ONE request: the empresa aggregate
 * (pr4 GET stays untouched for the registry list) plus the pipeline
 * row and the audit histories (transiciones who/when/from/to + handoffs)
 * the timeline renders. `pipeline` is null for pipeline-less empresas
 * (origen null) — that is a 200 with empty histories, NOT a 404.
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface DetalleSuccess extends DetalleEmpresa {
  success: true;
}

/** `Number.parseInt` with a positivity bound; null → route answers 400. */
function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DetalleSuccess | CrmErrorResponse>> {
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

    const { empresas, pipeline } = await getCrmDb();
    const detalle = await new ObtenerDetalleEmpresaUseCase(empresas, pipeline).execute(id);
    return NextResponse.json({ success: true, ...detalle });
  } catch (error) {
    return mapCrmError('crm empresas [id] detalle GET', error);
  }
}
