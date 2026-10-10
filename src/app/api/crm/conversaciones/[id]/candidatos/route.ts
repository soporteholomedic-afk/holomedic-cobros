import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import type { ContactoConEmpresa } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../../../empresas/errorResponse';

/**
 * `GET /api/crm/conversaciones/[id]/candidatos?busqueda=` (permiso
 * `crm_conversaciones`, agente-ia-crm E1) — the contacto candidates
 * for the operator vinculación panel ("Asociar contacto"): free-text
 * search over CRM_Contactos.nombre / CRM_Empresas.razonSocial (LIKE,
 * JOIN, TOP 20 by default) through the port's `buscarContactosTexto`.
 *
 * The `[id]` segment contextualizes the search to the conversation
 * being vinculada; the search itself is registry-wide, so the id is
 * only shape-validated (positive integer), never resolved — no extra
 * read the panel does not need.
 *
 * `busqueda` MUST arrive with ≥ 2 characters (trimmed): one-character
 * LIKEs are useless at the registry's size and would flood the panel.
 * Errors: typed `CrmErrorResponse` codes (empresas precedent).
 */

interface CandidatosSuccess {
  success: true;
  candidatos: ContactoConEmpresa[];
}

/** TOP fijo del buscador (suficiente para elegir a ojo; sin paging). */
const LIMITE_CANDIDATOS = 20;
const MIN_BUSQUEDA = 2;

/** `Number.parseInt` con cota de positividad; null → 400. */
function parseConversacionId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<CandidatosSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const { id: rawId } = await ctx.params;
    const id = parseConversacionId(rawId);
    if (id === null) {
      return buildCrmError('VALIDATION_ERROR', '"id" debe ser un número entero positivo', 400);
    }

    const url = new URL(request.url);
    const busqueda = (url.searchParams.get('busqueda') ?? '').trim();
    if (busqueda.length < MIN_BUSQUEDA) {
      return buildCrmError(
        'VALIDATION_ERROR',
        `"busqueda" requiere al menos ${MIN_BUSQUEDA} caracteres`,
        400,
      );
    }

    const { conversaciones: repo } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    if (repo.buscarContactosTexto === undefined) {
      // Puerto opcional (fakes): el adaptador SQL real siempre lo trae.
      return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    }

    const candidatos = await repo.buscarContactosTexto(busqueda, LIMITE_CANDIDATOS);
    return NextResponse.json({ success: true, candidatos });
  } catch (error) {
    return mapCrmError('crm conversaciones [id] candidatos GET', error);
  }
}
