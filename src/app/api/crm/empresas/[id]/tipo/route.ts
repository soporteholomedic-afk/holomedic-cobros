import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { CambiarTipoUseCase } from '@/features/crm/application/cambiarTipo';
import type { TipoEmpresa } from '@/features/crm/domain/entities';
import type { Clock } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/tipo` — T16 (design D3/D4, tasks pr10/WU3).
 * The Prospecto→Cliente conversion updates the empresa's tipo and
 * emits the ConversiónProspectoACliente result event (attributed to
 * the acting user) in ONE transaction; the reverse direction is a
 * silent tipo update (no catalog event exists for a demotion).
 *
 * Permiso: `crm` at the route prefix PLUS `crm_admin` checked IN-ROUTE
 * (design D2: tipo changes are empresa-level mutations, the same
 * elevation POST/PUT empresas require — prefix matching cannot split
 * by HTTP method).
 */

interface TipoSuccess {
  success: true;
  tipo: TipoEmpresa;
  /** true → the ConversiónProspectoACliente result event was emitted. */
  conversion: boolean;
}

const TIPOS_EMPRESA: readonly TipoEmpresa[] = ['Cliente', 'Prospecto'];

function isTipoEmpresa(v: unknown): v is TipoEmpresa {
  return typeof v === 'string' && (TIPOS_EMPRESA as readonly string[]).includes(v);
}

function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<TipoSuccess | CrmErrorResponse>> {
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
    if (typeof body !== 'object' || body === null || !isTipoEmpresa((body as Record<string, unknown>).tipo)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo inválido: se requiere {tipo: "Cliente" | "Prospecto"}', 400);
    }
    const { tipo } = body as { tipo: TipoEmpresa };

    const { empresas, pipeline } = await getCrmDb();
    const clock: Clock = () => new Date();
    const resultado = await new CambiarTipoUseCase(empresas, pipeline, clock).execute({
      empresaId: id,
      nuevoTipo: tipo,
      usuario: session.sub,
    });
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return mapCrmError('crm empresas [id] tipo POST', error);
  }
}
