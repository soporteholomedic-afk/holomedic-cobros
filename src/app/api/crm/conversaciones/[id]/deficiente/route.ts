import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  MarcarRespuestaDeficienteUseCase,
  MensajeYaMarcadoError,
  SinConsultaPreviaError,
} from '@/features/crm/application/marcarRespuestaDeficiente';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `POST /api/crm/conversaciones/[id]/deficiente` (permiso
 * `crm_conversaciones`, agente-ia-crm E4·T5) — the operator flags an
 * IA reply as deficient: the client question it failed to answer
 * becomes a KB-gap candidate and the reply carries the `deficiente`
 * flag. Body: `{mensajeId}` (positive integer). Wires
 * marcarRespuestaDeficiente over getCrmDb(); the session identity
 * rides for the audit context.
 *
 * Errors: typed `CrmErrorResponse` — MENSAJE_YA_MARCADO → 409
 * (huecoId incluido cuando se conoce, checked BEFORE the generic
 * ConflictError shape), SIN_CONSULTA_PREVIA → 422 (NOT the 400 its
 * ValidationError parent would map to), mensaje/conversación
 * inexistente → 404, body/id inválido → 400.
 */

interface DeficienteSuccess {
  success: true;
  /** The KB-gap candidate the flagged reply left behind. */
  huecoId: number;
  /** The flagged IA reply. */
  mensajeId: number;
}

interface DeficienteConflictBody extends CrmErrorResponse {
  /** The existing hueco when the reply was already marked (si se conoce). */
  huecoId?: number;
}

function esDeficienteBody(v: unknown): v is { mensajeId: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { mensajeId?: unknown }).mensajeId === 'number' &&
    Number.isInteger((v as { mensajeId?: unknown }).mensajeId) &&
    (v as { mensajeId: number }).mensajeId > 0
  );
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DeficienteSuccess | DeficienteConflictBody>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parsearIdConversacion(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!esDeficienteBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {mensajeId} (entero positivo)',
        400,
      );
    }

    const { conversaciones, mensajes, conocimiento } = await getCrmDb();
    if (!conversaciones || !mensajes || !conocimiento) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const resultado = await new MarcarRespuestaDeficienteUseCase({
      conversaciones,
      mensajes,
      conocimiento,
    }).ejecutar({
      conversacionId: id,
      mensajeId: body.mensajeId,
      usuarioId: session.sub,
      usuarioNombre: session.nombre,
    });

    return NextResponse.json({
      success: true,
      huecoId: resultado.huecoId,
      mensajeId: resultado.mensajeId,
    } satisfies DeficienteSuccess);
  } catch (error) {
    // Orden de chequeos: las subclases tipadas ANTES de que mapCrmError
    // las colapse en la forma genérica de su clase base.
    if (error instanceof MensajeYaMarcadoError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: 'CONFLICT_ERROR',
          ...(error.huecoId !== null ? { huecoId: error.huecoId } : {}),
        } satisfies DeficienteConflictBody,
        { status: 409 },
      );
    }
    // SinConsultaPreviaError extiende ValidationError: sin este chequeo
    // previo mapCrmError lo mandaría al 400 — el contrato es 422 (la
    // petición está bien formada, el hilo no tiene consulta que
    // recuperar).
    if (error instanceof SinConsultaPreviaError) {
      return buildCrmError('VALIDATION_ERROR', error.message, 422);
    }
    return mapCrmError('crm conversaciones [id] deficiente POST', error);
  }
}
