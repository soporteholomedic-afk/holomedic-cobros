import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import {
  VincularConversacionUseCase,
  type NuevoContactoVinculacion,
  type VincularConversacionEntrada,
} from '@/features/crm/application/vincularConversacion';
import type { ConversacionListada } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';

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

/** `Number.parseInt` con cota de positividad; null → 400. */
function parseConversacionId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    const id = parseConversacionId(rawId);
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

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const conversacion = await new VincularConversacionUseCase({ conversaciones: repo }).ejecutar({
      conversacionId: id,
      modo: body.modo,
      contactoId: body.contactoId,
      empresaId: body.empresaId,
      nuevoContacto: body.nuevoContacto,
    });
    return NextResponse.json({ success: true, conversacion });
  } catch (error) {
    return mapCrmError('crm conversaciones [id] vincular POST', error);
  }
}
