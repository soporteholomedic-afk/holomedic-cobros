import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { RegistrarTransicionUseCase } from '@/features/crm/application/registrarTransicion';
import type { PipelineEmpresa } from '@/features/crm/domain/entities';
import type { HandoffInput } from '@/features/crm/domain/ports';
import type { EstadoPipeline, EventoPipeline, TipoResultado } from '@/features/crm/domain/maquinaEstados';
import { EVENTOS_PIPELINE } from '@/features/crm/domain/maquinaEstados';
import type { Clock } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/transiciones` (permiso `crm`, tasks pr10/WU3,
 * spec G4) — applies ONE machine transition to the empresa's pipeline
 * row. The use case runs the pure state machine + effects and the
 * adapter persists pipeline + audit + optional result/handoff rows in
 * ONE transaction.
 *
 * Body: { evento, motivo?, handoff?: { area, nota? } } — `motivo` is
 * required for `Rechazo` (T14), `handoff` for `HandoffRegistrado`
 * (T5). `ConversiónProspectoACliente` (T16) is rejected here: the tipo
 * conversion belongs to POST .../tipo.
 *
 * Errors: typed `CrmErrorResponse` codes — the machine's
 * TransicionInvalidaError is a ValidationError, so an illegal move
 * answers 400 with its Spanish message verbatim.
 */

interface TransicionSuccess {
  success: true;
  estado: EstadoPipeline;
  resultado: TipoResultado | null;
  pipeline: PipelineEmpresa;
}

function isEventoPipeline(v: unknown): v is EventoPipeline {
  return typeof v === 'string' && (EVENTOS_PIPELINE as readonly string[]).includes(v);
}

function isOptionalString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === 'string';
}

function isHandoffBody(v: unknown): v is HandoffInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.area === 'string' && isOptionalString(obj.nota);
}

function isTransicionBody(v: unknown): v is { evento: EventoPipeline; motivo?: string; handoff?: HandoffInput } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!isEventoPipeline(obj.evento)) return false;
  if (obj.motivo !== undefined && !isOptionalString(obj.motivo)) return false;
  if (obj.handoff !== undefined && !isHandoffBody(obj.handoff)) return false;
  return true;
}

/** `Number.parseInt` with a positivity bound; null → route answers 400. */
function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<TransicionSuccess | CrmErrorResponse>> {
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
    if (!isTransicionBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {evento, motivo?, handoff?} con un evento del pipeline válido',
        400,
      );
    }

    const { pipeline } = await getCrmDb();
    const clock: Clock = () => new Date();
    const resultado = await new RegistrarTransicionUseCase(pipeline, clock).execute({
      empresaId: id,
      evento: body.evento,
      motivo: body.motivo ?? null,
      handoff: body.handoff ?? null,
      usuario: session.sub,
    });
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return mapCrmError('crm empresas [id] transiciones POST', error);
  }
}
