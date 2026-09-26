import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { buildCrmError, mapCrmError } from '@/app/api/crm/empresas/errorResponse';
import { generarPlantillaCrmBuffer } from '@/features/crm/infrastructure/excel/plantillaCrmBuilder';

/**
 * GET /api/crm/import/plantilla — "Descargar plantilla" download
 * endpoint (tasks pr7/WU3, spec G3, valoraciones excel precedent).
 *
 * Permiso `crm_admin`: the proxy already gates the `/api/crm/import`
 * prefix, and the route re-checks the session IN-ROUTE (defense in
 * depth, pr4 POST precedent — design D2).
 *
 * Streams the server-generated template workbook (pure exceljs builder,
 * columns derived from the shared `COLUMNAS_IMPORT_CRM` constant) with
 * a download Content-Disposition and `no-store` (the template is
 * generated fresh from the constant on every request).
 *
 * Responses:
 *  - 200 — the .xlsx bytes (`application/vnd.openxmlformats-...sheet`).
 *  - 401 UNAUTHORIZED / 403 FORBIDDEN — typed CRM error body.
 *  - 500 INTERNAL_ERROR — generic Spanish message, no internals echoed.
 */
const NOMBRE_ARCHIVO = 'plantilla-crm.xlsx';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_admin')) {
      return buildCrmError('FORBIDDEN', 'Esta acción requiere el permiso crm_admin', 403);
    }

    const buffer = await generarPlantillaCrmBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${NOMBRE_ARCHIVO}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return mapCrmError('crm import plantilla GET', error);
  }
}
