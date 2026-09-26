import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
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
 * Permiso: `crm` at the route prefix PLUS `crm_admin` checked IN-ROUTE
 * (design D2: assignment is an empresa-level mutation at the same
 * elevation as POST/PUT empresas — prefix matching cannot split by
 * HTTP method).
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
    if (!session.permisos.includes('crm_admin')) {
      return buildCrmError('FORBIDDEN', 'Esta acción requiere el permiso crm_admin', 403);
    }

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
