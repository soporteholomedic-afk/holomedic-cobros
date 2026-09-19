import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { buildCrmError, mapCrmError } from '@/app/api/crm/empresas/errorResponse';
import type { CrmErrorResponse } from '@/app/api/crm/empresas/errorResponse';
import { mapearFilasImportCrm } from '@/features/crm/domain/importar/mapearFilas';
import type { GrupoEmpresaImportado } from '@/features/crm/domain/importar/validarImportacion';
import type { ErrorFilaImport } from '@/features/crm/domain/importar/validarImportacion';
import { validarImportacion } from '@/features/crm/domain/importar/validarImportacion';

/**
 * POST /api/crm/import/validar — validation preview for the Excel
 * import wizard (tasks pr8/WU1–WU2, spec G2 "preview before commit").
 *
 * Permiso `crm_admin`: the proxy already gates the `/api/crm/import`
 * prefix and the route re-checks the session IN-ROUTE (defense in
 * depth, pr4 POST precedent — design D2).
 *
 * The client posts RAW sheet rows (header-keyed objects from the
 * browser-side `xlsx` parse); the route maps them through the shared
 * `mapearFilasImportCrm` boundary (pr6 header normalization, G3
 * anti-drift) and re-validates EVERYTHING server-side via the pure
 * `validarImportacion` — client-parsed rows are never trusted
 * (design §4).
 *
 * PREVIEW WRITES NOTHING (G2): this route never touches the database —
 * `getCrmDb()` is not even called. Groups whose rows carry errors or
 * conflicts are excluded and reported as Spanish
 * {fila, columna, mensaje} rows. Only POST /confirmar reaches the
 * executor.
 *
 * Responses:
 *  - 200 — { success, totalFilas, filasValidas, empresas, errores }.
 *  - 400 VALIDATION_ERROR — malformed body, bad shape or over-cap file.
 *  - 401 UNAUTHORIZED / 403 FORBIDDEN — typed CRM error body.
 *  - 500 INTERNAL_ERROR — generic Spanish message, no internals echoed.
 */

interface EmpresaPreview {
  ruc: string;
  razonSocial: string;
  tipo: string;
  /** Contacto names in first-seen order (post in-file collapse). */
  contactos: string[];
}

interface ValidarSuccess {
  success: true;
  totalFilas: number;
  filasValidas: number;
  empresas: EmpresaPreview[];
  errores: ErrorFilaImport[];
}

interface ValidarBody {
  archivoNombre: string;
  filas: Record<string, unknown>[];
}

function isFilaBruta(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shape guard only — business rules live in the pure validator. */
function isValidarBody(v: unknown): v is ValidarBody {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.archivoNombre === 'string' &&
    Array.isArray(obj.filas) &&
    obj.filas.every(isFilaBruta)
  );
}

function aEmpresaPreview(grupo: GrupoEmpresaImportado): EmpresaPreview {
  return {
    ruc: grupo.ruc,
    razonSocial: grupo.razonSocial,
    tipo: grupo.tipo,
    contactos: grupo.contactos.map((contacto) => contacto.nombre),
  };
}

export async function POST(
  request: Request,
): Promise<NextResponse<ValidarSuccess | CrmErrorResponse>> {
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
    if (!isValidarBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido. Requiere: {archivoNombre: string, filas: object[]}',
        400,
      );
    }

    // Maps header-keyed rows to FilaImportCrm and enforces the 2000-row
    // cap (typed Spanish error → 400 via mapCrmError).
    const filas = mapearFilasImportCrm(body.filas);
    const preview = validarImportacion(filas);

    return NextResponse.json({
      success: true,
      totalFilas: preview.totalFilas,
      filasValidas: preview.filasValidas,
      empresas: preview.grupos.map(aEmpresaPreview),
      errores: preview.errores,
    });
  } catch (error) {
    return mapCrmError('crm import validar POST', error);
  }
}
