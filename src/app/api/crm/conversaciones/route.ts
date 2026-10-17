import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { iniciarBarredorTareas } from '@/features/crm/infrastructure/agentes/iniciarBarredorTareas';
import { esModoSimuladoConfigurable } from '@/features/crm/infrastructure/whatsapp/crearEnviadorWhatsapp';
import { ListarConversacionesUseCase } from '@/features/crm/application/listarConversaciones';
import type { ConversacionListada } from '@/features/crm/domain/entities';
import type { EstadoConversacion } from '@/features/crm/domain/entities';
import type { FiltrosConversaciones } from '@/features/crm/domain/ports';
import { buildCrmError, mapCrmError, type CrmErrorResponse } from '../empresas/errorResponse';

/**
 * `GET /api/crm/conversaciones` (permiso `crm_conversaciones`,
 * agente-ia-crm E1) — the bandeja list: one page of conversations
 * widened with razonSocial/nombreContacto (LEFT JOINs in the adapter)
 * plus the TOTAL under the same filters so the view paginates without
 * a second unfiltered fetch. The body also carries `modoSimulado`
 * (esModoSimulado — KAPSO_MODO) so the view can show the inbound
 * simulator card WITHOUT ever reading process.env client-side (the
 * route is the single authority on the canal mode).
 *
 * Query params: `busqueda` (empresa/contacto/teléfono), `estado` (one
 * of the 6 lifecycle values), `offset` (≥0), `limite` (1–100, default
 * 50). Errors: typed `CrmErrorResponse` codes (empresas precedent).
 */

interface ListSuccess {
  success: true;
  conversaciones: ConversacionListada[];
  total: number;
  /** true while the canal runs SIMULADO (KAPSO_MODO !== 'real'). */
  modoSimulado: boolean;
}

const ESTADOS: readonly EstadoConversacion[] = [
  'ACTIVA_IA',
  'REQUIERE_HUMANO',
  'TOMADA_HUMANO',
  'PAUSADA',
  'PENDIENTE_VINCULACION',
  'CERRADA',
];

const LIMITE_DEFAULT = 50;
const LIMITE_MAX = 100;

// E2·T5: boot the lazy sweeper once per process — opening the bandeja
// guarantees a task drainer exists for the queue the webhook fills.
iniciarBarredorTareas();

function esEstadoConversacion(v: string): v is EstadoConversacion {
  return (ESTADOS as readonly string[]).includes(v);
}

/** `Number.parseInt` con cota inferior; null cuando el parámetro no vino. */
function parseEntero(raw: string | null, min: number): number | null {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= min ? parsed : null;
}

export async function GET(
  request: Request,
): Promise<NextResponse<ListSuccess | CrmErrorResponse>> {
  try {
    const session = await getSession();
    if (!session) return buildCrmError('UNAUTHORIZED', 'No autenticado', 401);
    if (!session.permisos.includes('crm_conversaciones')) {
      return buildCrmError('FORBIDDEN', 'No autorizado', 403);
    }

    const url = new URL(request.url);
    const filtros: FiltrosConversaciones = {};
    const busqueda = url.searchParams.get('busqueda');
    if (busqueda !== null && busqueda.trim() !== '') filtros.busqueda = busqueda.trim();

    const estado = url.searchParams.get('estado');
    if (estado !== null && estado !== '') {
      if (!esEstadoConversacion(estado)) {
        return buildCrmError(
          'VALIDATION_ERROR',
          `"estado" debe ser uno de: ${ESTADOS.join(', ')}`,
          400,
        );
      }
      filtros.estado = estado;
    }

    const offsetCrudo = url.searchParams.get('offset');
    if (offsetCrudo !== null) {
      const offset = parseEntero(offsetCrudo, 0);
      if (offset === null) {
        return buildCrmError('VALIDATION_ERROR', '"offset" debe ser un entero ≥ 0', 400);
      }
      filtros.offset = offset;
    }
    const limiteCrudo = url.searchParams.get('limite');
    if (limiteCrudo !== null) {
      const limite = parseEntero(limiteCrudo, 1);
      if (limite === null || limite > LIMITE_MAX) {
        return buildCrmError(
          'VALIDATION_ERROR',
          `"limite" debe ser un entero entre 1 y ${LIMITE_MAX}`,
          400,
        );
      }
      filtros.limite = limite;
    }
    if (filtros.limite === undefined) filtros.limite = LIMITE_DEFAULT;

    const { conversaciones: repo, config } = await getCrmDb();
    if (!repo) return buildCrmError('INTERNAL_ERROR', 'CRM no configurado', 503);
    const listado = await new ListarConversacionesUseCase(repo).ejecutar(filtros);
    return NextResponse.json({
      success: true,
      conversaciones: listado.items,
      total: listado.total,
      modoSimulado: await esModoSimuladoConfigurable({ config }),
    });
  } catch (error) {
    return mapCrmError('crm conversaciones GET', error);
  }
}
