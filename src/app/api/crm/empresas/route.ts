import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarEmpresasUseCase } from '@/features/crm/application/listarEmpresas';
import { CrearEmpresaUseCase } from '@/features/crm/application/crearEmpresa';
import type {
  CrearContactoInput,
  CrearEmpresaInput,
  Empresa,
  Origen,
  TipoEmpresa,
} from '@/features/crm/domain/entities';
import type { FiltrosEmpresas } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from './errorResponse';

/**
 * `/api/crm/empresas` — empresa registry collection (spec G1).
 *
 * - GET    (permiso `crm` via RUTAS_PROTEGIDAS prefix + re-checked here):
 *   filtered list. Query params: `q` (razón social / RUC), `tipo`.
 * - POST   (permiso `crm_admin` — checked IN-ROUTE because the proxy's
 *   prefix matching cannot split by HTTP method, design D2): creates an
 *   empresa. Business validation and RUC-dedup (409) live in the use
 *   case / adapter; this route only guards shape and session.
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts). Spanish
 * user-facing messages per repo convention.
 */

interface ListSuccess {
  success: true;
  empresas: Empresa[];
}

interface CreateSuccess {
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

/** Shape guard only — business rules (blank fields, ≥1 correo) stay in the use case. */
function isCrearContactoBody(v: unknown): v is CrearContactoInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.nombre === 'string' &&
    isOptionalString(obj.telefono) &&
    Array.isArray(obj.correos) &&
    obj.correos.every((correo) => typeof correo === 'string') &&
    (obj.esPrincipal === undefined || typeof obj.esPrincipal === 'boolean')
  );
}

function isCrearEmpresaBody(v: unknown): v is CrearEmpresaInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.razonSocial === 'string' &&
    isTipoEmpresa(obj.tipo) &&
    (obj.origen === undefined || obj.origen === null || isOrigen(obj.origen)) &&
    isOptionalString(obj.proyectoObra) &&
    isOptionalString(obj.destinoComun) &&
    isOptionalString(obj.notas) &&
    isOptionalString(obj.responsable) &&
    Array.isArray(obj.contactos) &&
    obj.contactos.every(isCrearContactoBody)
  );
}

export async function GET(
  request: Request,
): Promise<NextResponse<ListSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const url = new URL(request.url);
    const filtros: FiltrosEmpresas = {};
    const q = url.searchParams.get('q');
    if (q !== null && q.trim() !== '') filtros.q = q.trim();
    const tipo = url.searchParams.get('tipo');
    if (tipo !== null && tipo !== '') {
      if (!isTipoEmpresa(tipo)) {
        return buildCrmError(
          'VALIDATION_ERROR',
          '"tipo" debe ser "Cliente" o "Prospecto"',
          400,
        );
      }
      filtros.tipo = tipo;
    }

    const { empresas: repo } = await getCrmDb();
    const empresas = await new ListarEmpresasUseCase(repo).execute(filtros);
    return NextResponse.json({ success: true, empresas });
  } catch (error) {
    return mapCrmError('crm empresas GET', error);
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<CreateSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_admin')) {
      return buildCrmError('FORBIDDEN', 'Esta acción requiere el permiso crm_admin', 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildCrmError('VALIDATION_ERROR', 'El cuerpo debe ser JSON válido', 400);
    }
    if (!isCrearEmpresaBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido. Requiere: {ruc, razonSocial, tipo, contactos: [{nombre, correos[]}]}',
        400,
      );
    }

    // Explicit whitelist — unknown extra keys never reach the use case.
    const input: CrearEmpresaInput = {
      ruc: body.ruc,
      razonSocial: body.razonSocial,
      tipo: body.tipo,
      origen: body.origen ?? null,
      proyectoObra: body.proyectoObra ?? null,
      destinoComun: body.destinoComun ?? null,
      notas: body.notas ?? null,
      responsable: body.responsable ?? null,
      contactos: body.contactos.map((contacto) => ({
        nombre: contacto.nombre,
        telefono: contacto.telefono ?? null,
        esPrincipal: contacto.esPrincipal,
        correos: contacto.correos,
      })),
    };

    const { empresas: repo } = await getCrmDb();
    const empresa = await new CrearEmpresaUseCase(repo).execute(input);
    return NextResponse.json({ success: true, empresa }, { status: 201 });
  } catch (error) {
    return mapCrmError('crm empresas POST', error);
  }
}
