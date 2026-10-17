import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { resolverConfigAgente } from '@/features/crm/application/resolverConfigAgente';
import {
  AjustesConversacionUseCase,
  type AjustesConversacion,
} from '@/features/crm/application/ajustesConversacion';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `GET|POST /api/crm/conversaciones/[id]/ajustes` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T5) — the operator's settings
 * panel over the hilo.
 *
 * GET: estado/modo/asignadaA/memoriaActiva + the PUBLIC agent config
 * (umbralConfianza, maxIntercambios, horarioDesde, horarioHasta — no
 * secret crosses). POST: `{memoriaActiva: boolean}` — the privacy
 * toggle, the ONLY per-conversation setting, returning the REFRESHED
 * ajustes.
 *
 * Errors: typed `CrmErrorResponse` — conversación faltante → 404,
 * body inválido → 400.
 */

interface AjustesSuccess extends AjustesConversacion {
  success: true;
}

function esToggleBody(v: unknown): v is { memoriaActiva: boolean } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { memoriaActiva?: unknown }).memoriaActiva === 'boolean'
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<AjustesSuccess | CrmErrorResponse>> {
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

    const { conversaciones: repo, config } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const ajustes = await new AjustesConversacionUseCase({
      conversaciones: repo,
      ...(config ? { config: () => resolverConfigAgente({ config }) } : {}),
    }).obtener(id);
    return NextResponse.json({ success: true, ...ajustes } satisfies AjustesSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] ajustes GET', error);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<AjustesSuccess | CrmErrorResponse>> {
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
    if (!esToggleBody(body)) {
      return buildCrmError('VALIDATION_ERROR', 'Cuerpo inválido: se requiere {memoriaActiva: boolean}', 400);
    }

    const { conversaciones: repo, config } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const ajustes = await new AjustesConversacionUseCase({
      conversaciones: repo,
      ...(config ? { config: () => resolverConfigAgente({ config }) } : {}),
    }).actualizarMemoriaActiva(id, body.memoriaActiva);
    return NextResponse.json({ success: true, ...ajustes } satisfies AjustesSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] ajustes POST', error);
  }
}
