import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { TomarConversacionUseCase } from '@/features/crm/application/tomarConversacion';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `POST /api/crm/conversaciones/[id]/tomar` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — the operator takes
 * over the conversation. Empty body. Canonical sub → login identity
 * resolution (empresas asignar precedent): getUsuarioDb().getById(
 * session.sub) gives the login name — the currency asignadaA stores —
 * plus the display name; a session whose user row is gone gets 401.
 *
 * Errors: typed `CrmErrorResponse` — ya tomada / estado inválido →
 * 409, conversación → 404.
 */

interface TomarSuccess {
  success: true;
  estado: 'TOMADA_HUMANO';
  asignadaA: string;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<TomarSuccess | CrmErrorResponse>> {
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

    // Resolución canónica idUsuario → usuario (empresas asignar
    // precedent): asignadaA guarda el LOGIN, nunca el sub opaco.
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    if (filaUsuario === null) {
      return buildCrmError('UNAUTHORIZED', 'La sesión ya no corresponde a un usuario válido', 401);
    }

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const resultado = await new TomarConversacionUseCase({ conversaciones: repo }).ejecutar({
      conversacionId: id,
      usuario: { id: filaUsuario.usuario, nombre: filaUsuario.nombre },
    });
    return NextResponse.json({
      success: true,
      estado: resultado.estado,
      asignadaA: resultado.asignadaA,
    } satisfies TomarSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] tomar POST', error);
  }
}
