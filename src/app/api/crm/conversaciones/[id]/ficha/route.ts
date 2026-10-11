import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';
import { parsearIdConversacion } from '../../_id';
import { ObtenerFichaConversacionUseCase } from '@/features/crm/application/obtenerFichaConversacion';
import { ConfirmarDatoFichaUseCase } from '@/features/crm/application/confirmarDatoFicha';
import type { FichaConversacion } from '@/features/crm/domain/entities';

/**
 * `GET|POST /api/crm/conversaciones/[id]/ficha` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T4) — the living contact
 * card (ficha viva).
 *
 * GET: the merged card — canonical fields (contacto.cargo /
 * empresa.cantidadTrabajadores win when set) plus the per-campo
 * extracciones view. POST: `{campo, valor}` — the operator confirm
 * (HUMANO row + canonical promotion) returning the refreshed ficha.
 *
 * Errors: typed `CrmErrorResponse` — conversación faltante → 404,
 * body/campo/valor inválidos → 400 (shape here, semantics via
 * ValidationError), campo sin su llave (cargo sin contacto,
 * trabajadores sin empresa) → 409.
 */

interface FichaSuccess {
  success: true;
  conversacionId: FichaConversacion['conversacionId'];
  contacto: FichaConversacion['contacto'];
  empresa: FichaConversacion['empresa'];
  datos: FichaConversacion['datos'];
}

const CAMPOS_FICHA = ['cargo', 'trabajadores', 'sedes'] as const;

function esConfirmBody(v: unknown): v is { campo: (typeof CAMPOS_FICHA)[number]; valor: string } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.campo === 'string' &&
    (CAMPOS_FICHA as readonly string[]).includes(obj.campo) &&
    typeof obj.valor === 'string' &&
    obj.valor.trim() !== ''
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<FichaSuccess | CrmErrorResponse>> {
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

    const { conversaciones, empresas } = await getCrmDb();
    if (!conversaciones) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const ficha = await new ObtenerFichaConversacionUseCase({ conversaciones, empresas }).ejecutar(
      id,
    );
    return NextResponse.json({ success: true, ...ficha } satisfies FichaSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] ficha GET', error);
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<FichaSuccess | CrmErrorResponse>> {
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
    if (!esConfirmBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: se requiere {campo: "cargo"|"trabajadores"|"sedes", valor: string no vacío}',
        400,
      );
    }

    const { conversaciones, empresas } = await getCrmDb();
    if (!conversaciones) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);

    const obtenerFicha = new ObtenerFichaConversacionUseCase({ conversaciones, empresas });
    const ficha = await new ConfirmarDatoFichaUseCase({
      conversaciones,
      empresas,
      obtenerFicha,
    }).ejecutar({ conversacionId: id, campo: body.campo, valor: body.valor, usuario: session.sub });
    return NextResponse.json({ success: true, ...ficha } satisfies FichaSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones [id] ficha POST', error);
  }
}
