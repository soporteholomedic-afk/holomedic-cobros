import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { iniciarBarredorTareas } from '@/features/crm/infrastructure/agentes/iniciarBarredorTareas';
import { crearProcesadorTareasAgente } from '@/features/crm/infrastructure/agentes/crearProcesadorTareasAgente';
import {
  VincularConversacionUseCase,
  type NuevoContactoVinculacion,
  type VincularConversacionEntrada,
} from '@/features/crm/application/vincularConversacion';
import type { ConversacionListada } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

// E2·T5: boot the lazy sweeper once per process (same rule as the
// webhook/simular routes — vinculación puede encolar tareas IA).
iniciarBarredorTareas();

/**
 * `POST /api/crm/conversaciones/[id]/vincular` (permiso
 * `crm_conversaciones`, agente-ia-crm E1) — resolve a
 * PENDIENTE_VINCULACION conversation to the registry. Body:
 * - `{modo: 'asociar', contactoId}` — existing contacto (its empresaId
 *   is resolved from the contacto, never from the request);
 * - `{modo: 'crear', nuevoContacto: {empresaId, nombre, cargo?}}` —
 *   creates the contacto first, then links.
 * The vincular write moves the conversation to TOMADA_HUMANO.
 * Re-vincular is allowed (operator correction).
 *
 * Errors: typed `CrmErrorResponse` — validation → 400, unknown
 * conversation/contacto → 404, unique contact name → 409.
 */

interface VincularSuccess {
  success: true;
  conversacion: ConversacionListada;
}

function esNuevoContacto(v: unknown): v is NuevoContactoVinculacion {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.empresaId === 'number' &&
    Number.isInteger(obj.empresaId) &&
    typeof obj.nombre === 'string' &&
    (obj.cargo === undefined || obj.cargo === null || typeof obj.cargo === 'string')
  );
}

function esVincularBody(v: unknown): v is VincularConversacionEntrada {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.modo !== 'asociar' && obj.modo !== 'crear') return false;
  if (obj.contactoId !== undefined && (!Number.isInteger(obj.contactoId) || (obj.contactoId as number) < 1)) {
    return false;
  }
  if (obj.empresaId !== undefined && !Number.isInteger(obj.empresaId)) return false;
  if (obj.nuevoContacto !== undefined && !esNuevoContacto(obj.nuevoContacto)) return false;
  return true;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<VincularSuccess | CrmErrorResponse>> {
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
    if (!esVincularBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: {modo: "asociar" (con contactoId) | "crear" (con nuevoContacto {empresaId, nombre})}',
        400,
      );
    }

    const { conversaciones: repo, mensajes, tareas } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const conversacion = await new VincularConversacionUseCase({
      conversaciones: repo,
      mensajes,
      tareas,
    }).ejecutar({
      conversacionId: id,
      modo: body.modo,
      contactoId: body.contactoId,
      empresaId: body.empresaId,
      nuevoContacto: body.nuevoContacto,
    });
    // E2·T5: vinculación nace ACTIVA_IA y puede encolar una tarea
    // GENERAR_RESPUESTA para el último mensaje del cliente — drenar
    // fire-and-forget (el barredor hace backstop).
    void crearProcesadorTareasAgente()
      .procesar()
      .catch((err: unknown) => {
        console.error('[crm vincular] drenaje de tareas del agente falló', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return NextResponse.json({ success: true, conversacion });
  } catch (error) {
    return mapCrmError('crm conversaciones [id] vincular POST', error);
  }
}
