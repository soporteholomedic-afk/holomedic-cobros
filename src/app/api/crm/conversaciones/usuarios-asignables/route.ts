import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { ListarUsuariosAsignablesUseCase } from '@/features/crm/application/listarUsuariosAsignables';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../empresas/errorResponse';

/**
 * `GET /api/crm/conversaciones/usuarios-asignables` (permiso
 * `crm_conversaciones`, agente-ia-crm E3·T3) — the escalar target
 * list: users whose permisos include `crm_conversaciones`, wired
 * over the auth usuarios source (getUsuarioDb() — /api/usuarios
 * route precedent). ONLY {id, nombre} crosses the API: id is the
 * LOGIN name (the currency asignadaA stores), and no other field —
 * area, correo, permisos, hash — ever leaks.
 */

interface UsuariosAsignablesSuccess {
  success: true;
  usuarios: Array<{ id: string; nombre: string }>;
}

export async function GET(): Promise<NextResponse<UsuariosAsignablesSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const usuarios = await getUsuarioDb();
    const asignables = await new ListarUsuariosAsignablesUseCase(usuarios).ejecutar();
    return NextResponse.json({ success: true, usuarios: asignables } satisfies UsuariosAsignablesSuccess);
  } catch (error) {
    return mapCrmError('crm conversaciones usuarios-asignables GET', error);
  }
}
