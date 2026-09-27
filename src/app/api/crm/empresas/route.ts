import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
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
import { SECTORES_CRM, type SectorCrm } from '@/features/crm/domain/entities';
import type { FiltrosEmpresas } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from './errorResponse';

/**
 * `/api/crm/empresas` — empresa registry collection (spec G1).
 *
 * - GET    (permiso `crm` via RUTAS_PROTEGIDAS prefix + re-checked here):
 *   filtered list. Query params: `q` (razón social / RUC), `tipo`.
 * - POST   (permiso `crm`; self-assignment guard for non-admins —
 *   crm-ux redesign): creates an empresa. A `crm_admin` keeps the
 *   full freedom (any `responsable`, including none); a plain `crm`
 *   holder may ONLY create auto-assigned to themselves — a foreign
 *   `responsable` is 403 and a missing one defaults to `session.sub`
 *   (the Cola de hoy quick-capture contract). Business validation
 *   and RUC-dedup (409) live in the use case / adapter; this route
 *   only guards shape, session and the self-assignment rule.
 *
 *   Alta-panel contract (task 10.1, rediseno-crm-panel): the body
 *   round-trips `sector` (one of the six SECTORES_CRM labels),
 *   `cantidadTrabajadores` (integer ≥ 1) and `contactos[].cargo`.
 *   The modal's "enviar carta de inmediato" dispatch is deliberately
 *   NOT a server-side concern: the client POSTs
 *   `/api/crm/empresas/[id]/envios` right after this persists
 *   (persist-before-dispatch), so an SMTP failure leaves the empresa
 *   stored in sin_carta and the row's "Enviar carta" button IS the
 *   retry — one send path, no duplication.
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

/** Six-value sector domain (rediseno-crm-panel D6) — labels are the
 * canonical storage form, so the guard IS the membership check. */
function isSectorCrm(v: unknown): v is SectorCrm {
  return typeof v === 'string' && (SECTORES_CRM as readonly string[]).includes(v);
}

/** Shape guard only — business rules (blank fields, ≥1 correo) stay in the use case. */
function isCrearContactoBody(v: unknown): v is CrearContactoInput {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.nombre === 'string' &&
    isOptionalString(obj.telefono) &&
    isOptionalString(obj.cargo) &&
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
    isOptionalString(obj.sector) &&
    (obj.cantidadTrabajadores === undefined ||
      obj.cantidadTrabajadores === null ||
      typeof obj.cantidadTrabajadores === 'number') &&
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
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }
    const esAdmin = session.permisos.includes('crm_admin');

    // Canonical idUsuario → usuario resolution (cartera route
    // precedent): the self-assignment writes the LOGIN NAME — the
    // currency CRM_Empresas.responsable stores — never the opaque sub.
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    const usuarioSesion = filaUsuario?.usuario ?? null;
    if (usuarioSesion === null) {
      return buildCrmError('UNAUTHORIZED', 'La sesión ya no corresponde a un usuario válido', 401);
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

    // Alta-panel contract (task 10.1): the sector must be one of the six
    // canonical labels and the head-count a whole ≥1 — enum/shape checks
    // mirror the GET `tipo` filter precedent. Blank/absent stays null.
    if (body.sector !== undefined && body.sector !== null && !isSectorCrm(body.sector)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        `"sector" debe ser uno de: ${SECTORES_CRM.join(', ')}`,
        400,
      );
    }
    if (
      body.cantidadTrabajadores !== undefined &&
      body.cantidadTrabajadores !== null &&
      (!Number.isInteger(body.cantidadTrabajadores) || body.cantidadTrabajadores < 1)
    ) {
      return buildCrmError(
        'VALIDATION_ERROR',
        '"cantidadTrabajadores" debe ser un entero mayor o igual a 1',
        400,
      );
    }

    // Self-assignment guard: non-admins may only create empresas for
    // THEMSELVES (a foreign responsable is 403; a missing one defaults
    // to the session user's login name). Admins keep the unrestricted
    // contract.
    if (!esAdmin) {
      const responsablePedido = body.responsable?.trim() ?? '';
      if (responsablePedido !== '' && responsablePedido !== usuarioSesion) {
        return buildCrmError(
          'FORBIDDEN',
          'Solo puedes crear empresas asignadas a tu propio usuario',
          403,
        );
      }
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
      responsable: esAdmin ? (body.responsable ?? null) : usuarioSesion,
      sector: body.sector ?? null,
      cantidadTrabajadores: body.cantidadTrabajadores ?? null,
      contactos: body.contactos.map((contacto) => ({
        nombre: contacto.nombre,
        telefono: contacto.telefono ?? null,
        cargo: contacto.cargo ?? null,
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
