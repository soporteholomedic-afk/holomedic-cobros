'use client';

import { useCallback, useState } from 'react';

import type { HandoffInput } from '../../domain/ports';
import type { EventoPipeline } from '../../domain/maquinaEstados';

/**
 * useTransicion(empresaId) — client hook that applies ONE pipeline
 * transition through the pr10 endpoint (`POST
 * /api/crm/empresas/[id]/transiciones`). Fetch lives here, not in the
 * components (repo rule): EmpresaDetalle's direct action buttons and
 * both modals (Rechazo/Handoff) call `ejecutar`.
 *
 * The result is a plain {ok, error} object — never a thrown promise —
 * so callers can surface the API's Spanish error verbatim and decide
 * whether to close (success) or keep the form open (failure).
 */

export interface TransicionPayload {
  evento: EventoPipeline;
  /** T14's motivo — validated again server-side (required, ≤300). */
  motivo?: string;
  /** T5's handoff — validated again server-side (área required, ≤100). */
  handoff?: HandoffInput;
}

export interface ResultadoTransicionUi {
  ok: boolean;
  error: string | null;
}

/** Pure — the single source of the request URL for both hook and tests. */
export function buildTransicionesPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/transiciones`;
}

export function useTransicion(empresaId: number): {
  ejecutar: (payload: TransicionPayload) => Promise<ResultadoTransicionUi>;
  enCurso: boolean;
} {
  const [enCurso, setEnCurso] = useState(false);

  const ejecutar = useCallback(
    async (payload: TransicionPayload): Promise<ResultadoTransicionUi> => {
      setEnCurso(true);
      try {
        const response = await fetch(buildTransicionesPath(empresaId), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          return {
            ok: false,
            error: typeof apiError === 'string' ? apiError : `HTTP ${response.status}`,
          };
        }
        return { ok: true, error: null };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
      } finally {
        setEnCurso(false);
      }
    },
    [empresaId],
  );

  return { ejecutar, enCurso };
}
