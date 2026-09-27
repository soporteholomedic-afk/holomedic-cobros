import type { PlantillaCrmKey } from '../domain/ports';

import { payloadDeRespuesta } from './components/panel/ModalRespuesta';
import { buildTransicionesPath } from './hooks/useTransicion';

/**
 * accionesFila — the client seam for the panel's row-level actions
 * (decision 13, batch 14): sending one template through the EXISTING
 * POST /api/crm/empresas/[id]/envios endpoint (task 5.2 — extracted
 * from ModalFichaEmpresa so the ficha quick action and the row buttons
 * share one implementation and one error mapping) and pausing through
 * the EXISTING transiciones endpoint with the T14 Rechazo payload (the
 * same write ModalRespuesta performs on a negative answer, whose
 * payloadDeRespuesta stays the single source).
 *
 * Both actions return {ok, error} — never a thrown promise — so callers
 * surface the API's Spanish error verbatim (useTransicion/ficha
 * precedent) and refresh their own view on success.
 */

/** Single source of the envios request URL (ficha + panel rows). */
export function buildEnviosPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/envios`;
}

export interface ResultadoAccionFila {
  ok: boolean;
  error: string | null;
}

/** Pure — maps one response + parsed body to the caller result. */
function resultadoDe(response: Response, json: unknown): ResultadoAccionFila {
  if (!response.ok) {
    const apiError = (json as { error?: unknown }).error;
    return {
      ok: false,
      error: typeof apiError === 'string' ? apiError : `HTTP ${response.status}`,
    };
  }
  return { ok: true, error: null };
}

/** "Enviar carta" / "+1 Sem" / "Reactivar ya" — one template send for
 * one empresa (EnviarCorreoCrmUseCase route). */
export async function enviarCorreoEmpresa(
  empresaId: number,
  plantilla: PlantillaCrmKey,
): Promise<ResultadoAccionFila> {
  try {
    const response = await fetch(buildEnviosPath(empresaId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plantilla }),
    });
    const json: unknown = await response.json().catch(() => ({}));
    return resultadoDe(response, json);
  } catch {
    return { ok: false, error: 'Error de red' };
  }
}

/** "Pausar 3m" — T14 Rechazo with the default motivo (the same write
 * the respuesta modal performs on a negative answer). */
export async function pausarEmpresa(empresaId: number): Promise<ResultadoAccionFila> {
  try {
    const response = await fetch(buildTransicionesPath(empresaId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payloadDeRespuesta('negativo', '')),
    });
    const json: unknown = await response.json().catch(() => ({}));
    return resultadoDe(response, json);
  } catch {
    return { ok: false, error: 'Error de red' };
  }
}
