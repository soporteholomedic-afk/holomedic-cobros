import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarProductividadUseCase } from '@/features/crm/application/listarProductividad';
import { generarProductividadExcelBuffer } from '@/features/crm/infrastructure/excel/productividadExcelBuilder';
import { buildCrmError, mapCrmError } from '../../empresas/errorResponse';
import { esFechaValida } from '../fechas';

/**
 * GET `/api/crm/productividad/excel?desde=&hasta=` — "Exportar Excel"
 * download endpoint (tasks pr17/WU2, spec G6 "exportar Excel",
 * plantilla/valoraciones download precedents).
 *
 * Permiso `crm` with scoping IDENTICAL to the pr16 JSON endpoint (the
 * same use case applies the own-vs-all policy; the client can never
 * widen the scope): a plain `crm` holder exports ONLY their own
 * counts, `crm_admin` exports every user's. The period shares ONE
 * validator with the JSON route (`../fechas`) so both endpoints accept
 * exactly the same windows.
 *
 * Streams the server-generated workbook (pure exceljs builder fed with
 * the scoped FilaProductividad rows) with a download
 * Content-Disposition and `no-store` (generated fresh per request).
 *
 * Responses:
 *  - 200 — the .xlsx bytes (`application/vnd.openxmlformats-...sheet`).
 *  - 400 VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN — typed
 *    CRM error body (identical contract to the JSON endpoint).
 *  - 500 INTERNAL_ERROR — generic Spanish message, no internals echoed.
 */

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const params = new URL(request.url).searchParams;
    const desde = params.get('desde') ?? '';
    const hasta = params.get('hasta') ?? '';
    if (!esFechaValida(desde) || !esFechaValida(hasta)) {
      return buildCrmError(
        'VALIDATION_ERROR',
        '"desde" y "hasta" son fechas obligatorias con formato AAAA-MM-DD',
        400,
      );
    }
    if (desde > hasta) {
      return buildCrmError('VALIDATION_ERROR', '"desde" no puede ser posterior a "hasta"', 400);
    }

    // Canonical idUsuario → usuario resolution (pr15 decision), same as
    // the JSON endpoint — a stale session exports nothing.
    const usuarios = await getUsuarioDb();
    const filaUsuario = await usuarios.getById(session.sub);
    const usuario = filaUsuario?.usuario ?? null;
    if (usuario === null) {
      return buildCrmError(
        'UNAUTHORIZED',
        'La sesión ya no corresponde a un usuario válido',
        401,
      );
    }

    const esAdmin = session.permisos.includes('crm_admin');
    const { actividades, resultados } = await getCrmDb();
    const filas = await new ListarProductividadUseCase(actividades, resultados).execute({
      desde,
      hasta,
      usuario,
      esAdmin,
    });

    const buffer = await generarProductividadExcelBuffer({ desde, hasta, filas });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="productividad_${desde}_${hasta}.xlsx"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return mapCrmError('crm productividad excel GET', error);
  }
}
