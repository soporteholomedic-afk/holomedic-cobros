import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { RegistrarHandoffUseCase } from '@/features/crm/application/registrarHandoff';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/handoffs` (permiso `crm`, tasks pr10/WU3,
 * spec G4) — registers a standalone internal handoff record (área,
 * nota, user). T5's transition writes its OWN handoff inside the
 * transition transaction; this endpoint appends records at any time
 * (v1: internal record only, no external integration).
 */

interface HandoffSuccess {
  success: true;
  id: number;
}

function isHandoffBody(v: unknown): v is { area: string; nota?: string } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.area === 'string' && (obj.nota === undefined || typeof obj.nota === 'string');
}

function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<HandoffSuccess | CrmErrorResponse>> {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!isHandoffBody(body)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo inválido: se requiere {area, nota?}', 400);
    }

    const { empresas, handoffs } = await getCrmDb();
    const resultado = await new RegistrarHandoffUseCase(empresas, handoffs).execute({
      empresaId: id,
      area: body.area,
      nota: body.nota ?? null,
      usuario: session.sub,
    });
    return NextResponse.json({ success: true, id: resultado.id }, { status: 201 });
  } catch (error) {
    return mapCrmError('crm empresas [id] handoffs POST', error);
  }
}
