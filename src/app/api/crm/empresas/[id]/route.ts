import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ObtenerEmpresaUseCase } from '@/features/crm/application/obtenerEmpresa';
import { ActualizarEmpresaUseCase } from '@/features/crm/application/actualizarEmpresa';
import type {
  ActualizarEmpresaInput,
  Empresa,
  Origen,
  TipoEmpresa,
} from '@/features/crm/domain/entities';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../errorResponse';

/**
 * `/api/crm/empresas/[id]` — single empresa (spec G1).
 *
 * - GET (permiso `crm`): the full aggregate (empresa + contactos + correos).
 * - PUT (permiso `crm_admin` — checked IN-ROUTE, prefix matching cannot
 *   split by HTTP method, design D2): partial empresa-level update.
 *   RUC and contactos are NOT updatable here (see `ActualizarEmpresaInput`)
 *   — identity changes belong to the import flow (pr6).
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface GetSuccess {
  success: true;
  empresa: Empresa;
}

interface UpdateSuccess {
  success: true;
  empresa: Empresa;
}

const TIPOS_EMPRESA: readonly TipoEmpresa[] = ['Cliente', 'Prospecto'];
const ORIGENES: readonly Origen[] = ['Inbound', 'Outbound'];

function isTipoEmpresa(v: unknown): v is TipoEmpresa {
  return typeof v === 'string' && (TIPOS_EMPRESA as readonly string[]).includes(v);
}

function isOrigen(v: unknown): v is Origen {
  return typeof v === 'string' && (ORIGENES as readonly string[]).includes(v);
}

function isOptionalString(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === 'string';
}

/**
 * Shape guard for the partial update. Every field is optional but at
 * least ONE must be present (an empty body would be a no-op write).
 * `tipo` may not be nulled (NOT NULL column); `origen` and the free-text
 * fields may be (explicit clearing, pr3 adapter contract).
 */
function isActualizarEmpresaBody(v: unknown): v is ActualizarEmpresaInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  const campos = [
    'razonSocial',
    'tipo',
    'origen',
    'proyectoObra',
    'destinoComun',
    'notas',
    'responsable',
  ] as const;
  if (!isOptionalString(obj.razonSocial)) return false;
  if (obj.tipo !== undefined && !isTipoEmpresa(obj.tipo)) return false;
  if (obj.origen !== undefined && obj.origen !== null && !isOrigen(obj.origen)) return false;
  for (const campo of ['proyectoObra', 'destinoComun', 'notas', 'responsable'] as const) {
    if (!isOptionalString(obj[campo])) return false;
  }
  return campos.some((campo) => obj[campo] !== undefined);
}

/** `Number.parseInt` with a positivity bound; null → route answers 400. */
function parseEmpresaId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parseEmpresaId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    const { empresas: repo } = await getCrmDb();
    const empresa = await new ObtenerEmpresaUseCase(repo).execute(id);
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return mapCrmError('crm empresas [id] GET', error);
  }
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<UpdateSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_admin')) {
      return buildCrmError('FORBIDDEN', 'Esta acción requiere el permiso crm_admin', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parseEmpresaId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!isActualizarEmpresaBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido: debe incluir al menos un campo a actualizar {razonSocial?, tipo?, origen?, proyectoObra?, destinoComun?, notas?, responsable?}',
        400,
      );
    }

    // Explicit whitelist — unknown extra keys never reach the use case.
    const cambios: ActualizarEmpresaInput = {};
    if (body.razonSocial !== undefined) cambios.razonSocial = body.razonSocial;
    if (body.tipo !== undefined) cambios.tipo = body.tipo;
    if (body.origen !== undefined) cambios.origen = body.origen;
    if (body.proyectoObra !== undefined) cambios.proyectoObra = body.proyectoObra;
    if (body.destinoComun !== undefined) cambios.destinoComun = body.destinoComun;
    if (body.notas !== undefined) cambios.notas = body.notas;
    if (body.responsable !== undefined) cambios.responsable = body.responsable;

    const { empresas: repo } = await getCrmDb();
    const empresa = await new ActualizarEmpresaUseCase(repo).execute(id, cambios);
    return NextResponse.json({ success: true, empresa });
  } catch (error) {
    return mapCrmError('crm empresas [id] PUT', error);
  }
}
