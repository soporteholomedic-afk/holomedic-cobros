import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { crearMemoriaConversacion } from '@/features/crm/infrastructure/engram/crearMemoriaConversacion';
import { iniciarBarredorTareas } from '@/features/crm/infrastructure/agentes/iniciarBarredorTareas';
import { crearProcesadorTareasAgente } from '@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente';
import { AplicarIndicacionUseCase, AyudaNoPendienteError } from '@/features/crm/application/aplicarIndicacion';
import type { EstadoSolicitudAyuda } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

// E3·T3: boot the lazy sweeper once per process (vincular route rule —
// aplicar la indicación encola la tarea RESPONDER_CON_INDICACION).
iniciarBarredorTareas();

/**
 * `POST /api/crm/conversaciones/[id]/indicacion` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — the operator answers a
 * pending help request with an indicación: la Guía is told how to
 * proceed. Body: `{indicacion}`. Wires aplicarIndicacion over
 * getCrmDb() + crearMemoriaConversacion(); resueltaPor = the session
 * display name, falling back to the sub when the session carries none.
 *
 * Errors: typed `CrmErrorResponse` — AyudaNoPendienteError → 409
 * (checked BEFORE the generic NotFoundError mapping its parent class
 * would get), conversación → 404, indicación inválida → 400. After a
 * successful apply the agent queue drains fire-and-forget (the
 * RESPONDER_CON_INDICACION task relaunches la Guía immediately — the
 * barredor is only the backstop).
 */

interface IndicacionSuccess {
  success: true;
  /** RESUELTA after a successful apply (the row the use case returns). */
  solicitud: { id: number; estado: EstadoSolicitudAyuda };
  hueco: { id: number };
  memoria: { guardada: boolean };
  tarea: { id: number; tipo: 'RESPONDER_CON_INDICACION' };
}

function esIndicacionBody(v: unknown): v is { indicacion: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { indicacion?: unknown }).indicacion === 'string'
  );
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<IndicacionSuccess | CrmErrorResponse>> {
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
    if (!esIndicacionBody(body)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo inválido: se requiere {indicacion}', 400);
    }

    const { conversaciones, mensajes, conocimiento, tareas } = await getCrmDb();
    if (!conversaciones || !mensajes || !conocimiento || !tareas) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const resultado = await new AplicarIndicacionUseCase({
      conversaciones,
      conocimiento,
      memoria: crearMemoriaConversacion(),
      tareas,
      mensajes,
    }).ejecutar({
      conversacionId: id,
      indicacion: body.indicacion,
      usuarioId: session.sub,
      usuarioNombre: session.nombre,
    });

    // E3·T2 wiring: la tarea está encolada — drenar fire-and-forget
    // para que la Guía responda YA (el barredor hace backstop).
    void crearProcesadorTareasAgente()
      .procesar()
      .catch((err: unknown) => {
        console.error('[crm indicacion] drenaje de tareas del agente falló', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return NextResponse.json({
      success: true,
      solicitud: { id: resultado.solicitud.id, estado: resultado.solicitud.estado },
      hueco: { id: resultado.hueco.id },
      memoria: { guardada: resultado.memoria.guardada },
      tarea: { id: resultado.tarea.id, tipo: 'RESPONDER_CON_INDICACION' },
    } satisfies IndicacionSuccess);
  } catch (error) {
    // AyudaNoPendienteError extiende NotFoundError: sin este chequeo
    // previo, mapCrmError lo mandaría al 404 — el contrato es 409
    // (la conversación EXISTE, no hay nada pendiente que aplicar).
    if (error instanceof AyudaNoPendienteError) {
      return buildCrmError('CONFLICT_ERROR', error.message, 409);
    }
    return mapCrmError('crm conversaciones [id] indicacion POST', error);
  }
}
