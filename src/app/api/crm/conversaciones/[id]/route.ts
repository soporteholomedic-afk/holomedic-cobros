import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  ObtenerHiloConversacionUseCase,
  type HiloConversacion,
} from '@/features/crm/application/obtenerHiloConversacion';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';
import { parsearIdConversacion } from '../_id';

/**
 * `GET /api/crm/conversaciones/[id]` (permiso `crm_conversaciones`,
 * agente-ia-crm E1) — the bandeja hilo read: the conversation + its
 * messages oldest-first (the use case reverses the port's
 * newest-first page). Delivering the hilo MARKS it read (noLeidos = 0):
 * opening the conversation consumes the badge.
 *
 * Errors: typed `CrmErrorResponse` — an unknown id maps to 404 via
 * the typed ConversacionNoEncontradaError.
 */

interface HiloSuccess extends HiloConversacion {
  success: true;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<HiloSuccess | CrmErrorResponse>> {
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

    const { conversaciones: repoConversaciones, mensajes: repoMensajes } = await getCrmDb();
    if (!repoConversaciones || !repoMensajes) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const hilo = await new ObtenerHiloConversacionUseCase({
      conversaciones: repoConversaciones,
      mensajes: repoMensajes,
    }).ejecutar(id);

    return NextResponse.json({
      success: true,
      conversacion: hilo.conversacion,
      mensajes: hilo.mensajes,
    });
  } catch (error) {
    return mapCrmError('crm conversaciones [id] GET', error);
  }
}
