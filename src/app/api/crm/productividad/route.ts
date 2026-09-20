import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { ListarProductividadUseCase } from '@/features/crm/application/listarProductividad';
import type { FilaProductividad } from '@/features/crm/application/listarProductividad';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `/api/crm/productividad` (permiso `crm`, tasks pr16/WU2, spec G6
 * "Productivity visibility") — per-user activity + result counts for
 * the `?desde=&hasta=` period (inclusive, DATE-only).
 *
 * Identity resolution reuses the pr15 canonical decision: `session.sub`
 * carries the opaque auth id (dbo.usuarios.idUsuario) while the
 * CRM_Actividades/CRM_Resultados `usuario` columns store the login
 * username — resolved ONCE per request via `getUsuarioDb().getById(sub)`;
 * a session whose user row no longer exists gets 401.
 *
 * Scoping POLICY lives in the use case: a plain `crm` holder is always
 * counted with their own login name; `crm_admin` reads all users. The
 * API exposes NO scope parameter — the client cannot widen the view.
 *
 * Errors: typed `CrmErrorResponse` codes (see errorResponse.ts).
 */

interface ProductividadSuccess {
  success: true;
  /** The validated period, echoed back. */
  desde: string;
  hasta: string;
  filas: FilaProductividad[];
}

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Strict 'YYYY-MM-DD' shape + real calendar validity (regex alone
 * would accept 2026-02-31). Dates are naive America/Lima wall-clock
 * strings end to end (ADR-9); no timezone conversion anywhere.
 */
function esFechaValida(valor: string): boolean {
  if (!REGEX_FECHA.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio ?? 0, (mes ?? 1) - 1, dia ?? 1));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === (mes ?? 0) - 1 && fecha.getUTCDate() === dia
  );
}

export async function GET(
  request: Request,
): Promise<NextResponse<ProductividadSuccess | CrmErrorResponse>> {
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

    // Canonical idUsuario → usuario resolution (pr15 decision).
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
    return NextResponse.json({ success: true, desde, hasta, filas });
  } catch (error) {
    return mapCrmError('crm productividad GET', error);
  }
}
