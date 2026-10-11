import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { crearMemoriaConversacion } from '@/features/crm/infrastructure/engram/crearMemoriaConversacion';
import {
  GestionarMemoriaConversacionUseCase,
  ListarMemoriasConversacionUseCase,
} from '@/features/crm/application/listarMemoriasConversacion';
import { ErrorMemoriaCrm } from '@/features/crm/infrastructure/engram/memoriaEngramHttp';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';

/**
 * `GET|POST /api/crm/conversaciones/[id]/memorias` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — the operator memory
 * panel over the hilo.
 *
 * GET: the conversation's memory list (own chat session + empresa
 * session, pineada flags). POST: `{observacionId, accion:
 * 'pinear'|'eliminar'}` — one observation managed with the ownership
 * guard inside the use case (foreign observation → typed 404).
 *
 * Errors: typed `CrmErrorResponse` — conversación/observación ajena →
 * 404, body inválido → 400. ErrorMemoriaCrm (Engram upstream) maps to
 * 503 when the memory is simply not configured and 502 otherwise —
 * never a silent empty panel.
 */

interface MemoriasSuccess {
  success: true;
  memorias: Awaited<ReturnType<ListarMemoriasConversacionUseCase['ejecutar']>>['memorias'];
  empresaId: number | null;
}

/** Typed memory-upstream failure (mensajes route KAPSO_* precedent). */
interface MemoriaFailure {
  success: false;
  error: string;
  code: 'MEMORIA_ERROR' | 'MEMORIA_NO_CONFIGURADA';
}

function esGestionBody(v: unknown): v is { observacionId: number; accion: 'pinear' | 'eliminar' } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    Number.isInteger(obj.observacionId) &&
    (obj.observacionId as number) >= 1 &&
    (obj.accion === 'pinear' || obj.accion === 'eliminar')
  );
}

/** ErrorMemoriaCrm → 503 (no configurada) | 502 (upstream Engram). */
function mapErrorMemoria(error: ErrorMemoriaCrm): NextResponse<MemoriaFailure> {
  if (error.codigo === 'MEMORIA_NO_CONFIGURADA') {
    return NextResponse.json(
      {
        success: false,
        error: 'Memoria de conversación no configurada',
        code: 'MEMORIA_NO_CONFIGURADA',
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      error: 'La memoria de conversación no está disponible',
      code: 'MEMORIA_ERROR',
    },
    { status: 502 },
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<MemoriasSuccess | MemoriaFailure | CrmErrorResponse>> {
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

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    try {
      const resultado = await new ListarMemoriasConversacionUseCase({
        conversaciones: repo,
        memoria: crearMemoriaConversacion(),
      }).ejecutar(id);
      return NextResponse.json({ success: true, ...resultado } satisfies MemoriasSuccess);
    } catch (error) {
      if (error instanceof ErrorMemoriaCrm) return mapErrorMemoria(error);
      throw error;
    }
  } catch (error) {
    return mapCrmError('crm conversaciones [id] memorias GET', error);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true } | MemoriaFailure | CrmErrorResponse>> {
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
    if (!esGestionBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {observacionId, accion: "pinear"|"eliminar"}',
        400,
      );
    }

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    try {
      await new GestionarMemoriaConversacionUseCase({
        conversaciones: repo,
        memoria: crearMemoriaConversacion(),
      }).ejecutar({ conversacionId: id, observacionId: body.observacionId, accion: body.accion });
      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof ErrorMemoriaCrm) return mapErrorMemoria(error);
      throw error;
    }
  } catch (error) {
    return mapCrmError('crm conversaciones [id] memorias POST', error);
  }
}
