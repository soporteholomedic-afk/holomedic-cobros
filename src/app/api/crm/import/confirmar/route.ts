import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { buildCrmError, mapCrmError } from '@/app/api/crm/empresas/errorResponse';
import type { CrmErrorResponse } from '@/app/api/crm/empresas/errorResponse';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { mapearFilasImportCrm } from '@/features/crm/domain/importar/mapearFilas';
import { EjecutarImportacionUseCase } from '@/features/crm/application/importar/ejecutarImportacion';
import type { ResultadoEjecucionImportacion } from '@/features/crm/application/importar/ejecutarImportacion';

/**
 * POST /api/crm/import/confirmar — the commit step of the Excel import
 * wizard (tasks pr8/WU1–WU2, spec G2 upsert semantics).
 *
 * Permiso `crm_admin` (re-checked IN-ROUTE, pr4/pr7 precedent —
 * design D2).
 *
 * Flow: the client posts the SAME raw header-keyed rows it previewed;
 * the route maps them through the shared `mapearFilasImportCrm`
 * boundary and hands them to `EjecutarImportacionUseCase`, which
 * re-validates EVERYTHING (never trusts the client), executes ONE
 * transaction per RUC group through the `CrmImportadorPort` and writes
 * the `CRM_Importaciones` job record (always, even with group
 * failures). Cancelling the wizard simply never calls this route —
 * nothing is persisted without an explicit confirm (G2).
 *
 * Responses:
 *  - 200 — { success, resultado } with counters, errores/fallos/
 *    advertencias ({fila, columna, mensaje}) and the job id.
 *  - 400 VALIDATION_ERROR — malformed body, bad shape or over-cap file.
 *  - 401 UNAUTHORIZED / 403 FORBIDDEN — typed CRM error body.
 *  - 500 INTERNAL_ERROR — generic Spanish message, no internals echoed.
 */

interface ConfirmarSuccess {
  success: true;
  resultado: ResultadoEjecucionImportacion;
}

interface ConfirmarBody {
  archivoNombre: string;
  filas: Record<string, unknown>[];
}

function isFilaBruta(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shape guard only — re-validation lives in the use case. */
function isConfirmarBody(v: unknown): v is ConfirmarBody {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.archivoNombre === 'string' &&
    Array.isArray(obj.filas) &&
    obj.filas.every(isFilaBruta)
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<ConfirmarSuccess | CrmErrorResponse>> {
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
    if (!isConfirmarBody(body)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        'Cuerpo inválido. Requiere: {archivoNombre: string, filas: object[]}',
        400,
      );
    }

    // Cap enforcement + header normalization happen BEFORE any write
    // (over-cap files map to 400 without touching the database).
    const filas = mapearFilasImportCrm(body.filas);

    const { importador } = await getCrmDb();
    const resultado = await new EjecutarImportacionUseCase(importador).execute({
      filas,
      archivoNombre: body.archivoNombre,
      // The JWT subject is the acting principal (jjc createdBy precedent).
      usuario: session.sub,
    });

    return NextResponse.json({ success: true, resultado });
  } catch (error) {
    return mapCrmError('crm import confirmar POST', error);
  }
}
