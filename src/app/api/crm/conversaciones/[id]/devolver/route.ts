import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { DevolverConversacionUseCase } from '@/features/crm/application/devolverConversacion';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `POST /api/crm/conversaciones/[id]/devolver` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — hand the conversation
 * back to la Guía: TOMADA_HUMANO → ACTIVA_IA + asignadaA NULL + modo
 * 'IA', with the re-encola hook for the last unanswered IN message.
 * Empty body; no identity resolution (the devolución records no actor
 * — conversations have no asignaciones audit by design).
 *
 * Errors: typed `CrmErrorResponse` — estado inválido → 409,
 * conversación → 404.
 */

interface DevolverSuccess {
  success: true;
  estado: 'ACTIVA_IA';
  reencolada: boolean;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DevolverSuccess | CrmErrorResponse>> {
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

    const { conversaciones: repo, mensajes, tareas } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const resultado = await new DevolverConversacionUseCase({
      conversaciones: repo,
      mensajes,
      tareas,
    }).ejecutar({ conversacionId: id });
    return NextResponse.json({
      success: true,
      estado: resultado.estado,
      reencolada: resultado.reencolada,
    } satisfies DevolverSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] devolver POST', error);
  }
}
