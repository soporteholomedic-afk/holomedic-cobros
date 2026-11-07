import { NextResponse } from 'next/server';

import { buildError } from '@/app/api/crm/_lib/http';
import { getSession } from '@/lib/auth';
import type { Permiso } from '@/features/auth/domain/entities';

/** Same error-body shape as `ErrorResponse` in _lib/http (not exported there). */
interface ErrorBody {
  success: false;
  error: string;
}

/**
 * Parametrized in-route re-check (crm-consulta-sunat T2): the proxy
 * gates navigation by RUTAS_PROTEGIDAS, but every handler of
 * /api/crm/configuracion verifies session + its OWN permiso again
 * (defense in depth, same double gate as `exigirCrm`, which stays
 * untouched). Logged in without the permiso answers 403; anonymous 401.
 */

export interface UsuarioConfiguracion {
  sub: string;
  nombre: string;
}

/** The session user when it holds `permiso`, otherwise the response to return. */
export async function usuarioConPermiso(
  permiso: Permiso,
): Promise<{ usuario: UsuarioConfiguracion } | { denegado: NextResponse<ErrorBody> }> {
  const session = await getSession();
  if (!session) return { denegado: buildError('No autenticado', 401) };
  if (!session.permisos.includes(permiso)) return { denegado: buildError('No autorizado', 403) };
  return { usuario: { sub: session.sub, nombre: session.nombre } };
}
