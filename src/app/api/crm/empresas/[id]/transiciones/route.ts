import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { RegistrarTransicionUseCase } from '@/features/crm/application/registrarTransicion';
import type { PipelineEmpresa } from '@/features/crm/domain/entities';
import type { HandoffInput } from '@/features/crm/domain/ports';
import type { EstadoPipeline, EventoPipeline, TipoResultado } from '@/features/crm/domain/maquinaEstados';
import { EVENTOS_PIPELINE } from '@/features/crm/domain/maquinaEstados';
import {
  CARGOS_OPERATIVOS,
  construirResumenDatos,
  limpiarParDato,
  type DatosOperativosInput,
  type ParDatoOperativo,
} from '@/features/crm/domain/datosOperativos';
import type { Clock } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../errorResponse';

/**
 * `/api/crm/empresas/[id]/transiciones` (permiso `crm`, tasks pr10/WU3,
 * spec G4) — applies ONE machine transition to the empresa's pipeline
 * row. The use case runs the pure state machine + effects and the
 * adapter persists pipeline + audit + optional result/handoff rows in
 * ONE transaction.
 *
 * Body: { evento, motivo?, handoff?: { area, nota? }, datos? } —
 * `motivo` is required for `Rechazo` (T14), `handoff` for
 * `HandoffRegistrado` (T5). `datos` (crm-ux redesign) is the
 * DatosSolicitados capture: three optional (encargado, correo) pairs
 * that become FIRST-CLASS contactos with a cargo (upserted BEFORE
 * the transition so a retry is always safe) and ride the transition's
 * motivo as a compact Spanish summary. `ConversiónProspectoACliente`
 * (T16) is rejected here: the tipo conversion belongs to POST
 * .../tipo.
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

function isParDato(v: unknown): v is ParDatoOperativo {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    (obj.encargado === undefined || typeof obj.encargado === 'string') &&
    (obj.correo === undefined || typeof obj.correo === 'string')
  );
}

function isDatosBody(v: unknown): v is DatosOperativosInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    (obj.facturacion === undefined || isParDato(obj.facturacion)) &&
    (obj.medicoOcupacional === undefined || isParDato(obj.medicoOcupacional)) &&
    (obj.administrador === undefined || isParDato(obj.administrador))
  );
}

function isTransicionBody(
  v: unknown,
): v is { evento: EventoPipeline; motivo?: string; handoff?: HandoffInput; datos?: DatosOperativosInput } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!isEventoPipeline(obj.evento)) return false;
  if (obj.motivo !== undefined && !isOptionalString(obj.motivo)) return false;
  if (obj.handoff !== undefined && !isHandoffBody(obj.handoff)) return false;
  if (obj.datos !== undefined && !isDatosBody(obj.datos)) return false;
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
        'Cuerpo inválido: se requiere {evento, motivo?, handoff?, datos?} con un evento del pipeline válido',
        400,
      );
    }
    if (body.datos !== undefined && body.evento !== 'DatosSolicitados') {
      return buildCrmError('VALIDATION_ERROR', '"datos" solo se admite con el evento DatosSolicitados', 400);
    }

    const { pipeline, empresas } = await getCrmDb();

    // Operational contactos FIRST (idempotent upsert by cargo) — a
    // failed transition leaves retry-safe state: the upsert re-runs
    // harmlessly, the transition re-fires (crm-ux redesign).
    if (body.datos !== undefined && empresas.guardarContactoOperativo !== undefined) {
      for (const { clave, cargo } of CARGOS_OPERATIVOS) {
        const { encargado, correo } = limpiarParDato(body.datos[clave]);
        if (encargado === null && correo === null) continue;
        await empresas.guardarContactoOperativo(id, cargo, { nombre: encargado, correo });
      }
    }

    // The datos capture rides the audit motivo as a readable summary
    // (an explicit motivo wins only for non-datos events).
    const motivoDatos = body.datos !== undefined ? construirResumenDatos(body.datos) : null;
    const motivo = motivoDatos ?? body.motivo ?? null;

    const clock: Clock = () => new Date();
    const resultado = await new RegistrarTransicionUseCase(pipeline, clock).execute({
      empresaId: id,
      evento: body.evento,
      motivo,
      handoff: body.handoff ?? null,
      usuario: session.sub,
    });
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return mapCrmError('crm empresas [id] transiciones POST', error);
  }
}
