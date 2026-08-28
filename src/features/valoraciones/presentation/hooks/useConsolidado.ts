'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConsolidadoFila, DestinoTotal } from '../../domain/consolidado';
import type { ValoracionesFilter } from '../../domain/entities';
import type { ValoracionesStatus } from './useValoraciones';
import { buildValoracionesQuery } from './useValoraciones';

/**
 * `useConsolidado` — client hook for the consolidado query (REQ-03 Q-R6,
 * slice 2). Mirrors `useValoraciones`: components call `buscar(filtro)` and
 * render the server-adjusted filas/totales (the SIGLA ajuste runs in the
 * route via the domain module, so client and exports share one truth).
 * Stale responses are discarded via request ids; in-flight requests abort
 * on supersession/unmount.
 */
export interface UseConsolidadoResult {
  filas: ConsolidadoFila[];
  totales: DestinoTotal[];
  status: ValoracionesStatus;
  error: string | null;
  buscar: (filtro: ValoracionesFilter) => void;
}

/** Build the consolidado query string (sigla query + `consolidado=true`). */
export function buildConsolidadoQuery(filtro: ValoracionesFilter): string {
  const params = new URLSearchParams(buildValoracionesQuery(filtro));
  params.set('consolidado', 'true');
  return params.toString();
}

/** Light shape guard: our route contract with the ajuste already applied. */
function esRespuestaConsolidado(
  v: unknown,
): v is { filas: ConsolidadoFila[]; totales: DestinoTotal[] } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.filas) || !Array.isArray(obj.totales)) return false;
  return obj.filas.every((fila) => {
    if (typeof fila !== 'object' || fila === null) return false;
    const f = fila as Record<string, unknown>;
    return typeof f.codCli === 'number' && typeof f.venta === 'number';
  });
}

export function useConsolidado(): UseConsolidadoResult {
  const [filas, setFilas] = useState<ConsolidadoFila[]>([]);
  const [totales, setTotales] = useState<DestinoTotal[]>([]);
  const [status, setStatus] = useState<ValoracionesStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const buscar = useCallback((filtro: ValoracionesFilter): void => {
    const id = ++requestIdRef.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/valoraciones/sigla?${buildConsolidadoQuery(filtro)}`,
          { signal: ctrl.signal },
        );
        if (id !== requestIdRef.current) return; // superseded
        const json: unknown = await res.json().catch(() => ({}));
        if (id !== requestIdRef.current) return;

        if (!res.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(
            typeof apiError === 'string' ? apiError : `Error del servidor (${res.status})`,
          );
          setFilas([]);
          setTotales([]);
          return;
        }

        const body = (json as { filas?: unknown; totales?: unknown });
        const parsed = { filas: body.filas, totales: body.totales };
        if (!esRespuestaConsolidado(parsed)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setFilas([]);
          setTotales([]);
          return;
        }

        setStatus('ready');
        setFilas(parsed.filas);
        setTotales(parsed.totales);
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return; // superseded or unmount
        setStatus('error');
        setError(err instanceof TypeError ? 'Error de conexión' : String(err));
        setFilas([]);
        setTotales([]);
      }
    })();
  }, []);

  return { filas, totales, status, error, buscar };
}
