import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarUsuariosAsignablesUseCase } from '@/features/crm/application/listarUsuariosAsignables';
import { EscalarConversacionUseCase } from '@/features/crm/application/escalarConversacion';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `POST /api/crm/conversaciones/[id]/escalar` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — reassign a taken
 * conversation to ANOTHER operator. Body: `{usuarioId}` (the login
 * name usuarios-asignables exposes). The ROUTE owns the target
 * validation (empresas asignar precedent — identity checks live
 * route-side, the use case stays pure over repos): usuarioId must
 * belong to an ASIGNABLE user (permiso crm_conversaciones) resolved
 * over the auth usuarios source; unknown/no-permission targets get
 * 400 BEFORE the use case runs.
 *
 * Errors: typed `CrmErrorResponse` — target inválido → 400, estado
 * inválido → 409, conversación → 404.
 */

interface EscalarSuccess {
  success: true;
  estado: 'TOMADA_HUMANO';
  asignadaA: string;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<EscalarSuccess | CrmErrorResponse>> {
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
    const usuarioId =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).usuarioId
        : undefined;
    if (typeof usuarioId !== 'string' || usuarioId.trim() === '') {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {usuarioId: "<usuario>"}',
        400,
      );
    }

    // Target validation route-side: debe ser asignable (permiso
    // crm_conversaciones) — la MISMA fuente que alimenta el selector.
    const usuarios = await getUsuarioDb();
    const asignables = await new ListarUsuariosAsignablesUseCase(usuarios).ejecutar();
    if (!asignables.some((candidato) => candidato.id === usuarioId)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Usuario destino desconocido o sin permiso crm_conversaciones',
        400,
      );
    }

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const resultado = await new EscalarConversacionUseCase({ conversaciones: repo }).ejecutar({
      conversacionId: id,
      usuarioId,
    });
    return NextResponse.json({
      success: true,
      estado: resultado.estado,
      asignadaA: resultado.asignadaA,
    } satisfies EscalarSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] escalar POST', error);
  }
}
