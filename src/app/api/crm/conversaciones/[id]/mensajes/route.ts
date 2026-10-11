import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { crearEnviadorWhatsapp } from '@/features/crm/infrastructure/whatsapp/crearEnviadorWhatsapp';
import {
  ResponderConversacionUseCase,
  type ResultadoResponderConversacion,
} from '@/features/crm/application/responderConversacion';
import type { MensajeCrm } from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';

/**
 * `POST /api/crm/conversaciones/[id]/mensajes` (permiso
 * `crm_conversaciones`, agente-ia-crm E1) — ONE manual reply from the
 * bandeja. Body: `{cuerpo}`. The use case owns the whole contract:
 * validate → persist intent (PENDIENTE) → send (Kapso real o simulador
 * según KAPSO_MODO) → confirm (ENVIADO o FALLIDO; confirmación fallida
 * → 201 con advertencia CONFIRMACION_FALLIDA) → registrarActividad OUT.
 *
 * A failed outcome answers with the typed code:
 * - CUERPO_INVALIDO → 400 · SIN_TELEFONO → 409 ·
 *   CONVERSACION_CERRADA → 422 · CONVERSACION_NO_ENCONTRADA → 404 ·
 *   KAPSO_* (fallo del canal) → 502 con detalle.
 * The adapter never leaks the API key in `detalle` (security rule).
 */

interface ResponderSuccess {
  success: true;
  mensaje: MensajeCrm;
  /** R4 outbox-lite: el envío salió pero la confirmación ENVIADO/wamid no. */
  advertencia?: 'CONFIRMACION_FALLIDA';
}

interface ResponderFailure {
  success: false;
  error: string;
  code: string;
  detalle?: string;
}

function esCuerpoMensaje(v: unknown): v is { cuerpo: string } {
  return typeof v === 'object' && v !== null && typeof (v as { cuerpo?: unknown }).cuerpo === 'string';
}

/** `Number.parseInt` con cota de positividad; null → 400. */
function parseConversacionId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** code → HTTP status (the use case never throws these). */
function statusDeError(code: string): number {
  switch (code) {
    case 'CUERPO_INVALIDO':
      return 400;
    case 'SIN_TELEFONO':
      return 409;
    case 'CONVERSACION_CERRADA':
      return 422;
    case 'CONVERSACION_NO_ENCONTRADA':
      return 404;
    default:
      return 502;
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<ResponderSuccess | ResponderFailure | CrmErrorResponse>> {
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
    if (!esCuerpoMensaje(body)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo inválido: se requiere {cuerpo}', 400);
    }

    const { conversaciones: repoConversaciones, mensajes: repoMensajes } = await getCrmDb();
    if (!repoConversaciones || !repoMensajes) {
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const whatsapp = crearEnviadorWhatsapp();
    const resultado: ResultadoResponderConversacion = await new ResponderConversacionUseCase({
      conversaciones: repoConversaciones,
      mensajes: repoMensajes,
      whatsapp,
    }).ejecutar({ conversacionId: id, cuerpo: body.cuerpo });

    if (resultado.ok) {
      const exito: ResponderSuccess = { success: true, mensaje: resultado.mensaje };
      if (resultado.advertencia !== undefined) exito.advertencia = resultado.advertencia;
      return NextResponse.json(exito, { status: 201 });
    }
    const code = resultado.error.code;
    const detalle = 'detalle' in resultado.error ? resultado.error.detalle : undefined;
    const mensajeUsuario =
      code === 'CUERPO_INVALIDO'
        ? 'El cuerpo no puede estar vacío ni superar 4000 caracteres'
        : code === 'CONVERSACION_CERRADA'
          ? 'La conversación está cerrada'
          : code === 'SIN_TELEFONO'
            ? 'La conversación no tiene teléfono asociado'
            : code === 'CONVERSACION_NO_ENCONTRADA'
              ? 'Conversación no encontrada'
              : 'El envío por WhatsApp falló';
    const respuesta: ResponderFailure = { success: false, error: mensajeUsuario, code };
    if (detalle !== undefined) respuesta.detalle = detalle;
    return NextResponse.json(respuesta, { status: statusDeError(code) });
  } catch (error) {
    return mapCrmError('crm conversaciones [id] mensajes POST', error);
  }
}
