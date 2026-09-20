'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FilaProductividad } from '../../application/listarProductividad';

/**
 * useProductividad(desde, hasta) — client hook that loads the
 * per-user productivity summary (tasks pr16/WU3, spec G6) from
 * `/api/crm/productividad`. Fetch-only: the API route is the boundary
 * (useCartera precedent). The period comes from the caller (the
 * table's Desde/Hasta selector); changing either bound re-fetches.
 * The SCOPE (own vs all users) is the server's decision — the hook
 * carries no scope parameter.
 *
 * Status machine: 'loading' (in flight) → 'ready' (200 with the filas)
 * | 'error' (non-OK response, unexpected shape or network failure).
 * `retry()` re-runs the fetch.
 */

export type UseProductividadStatus = 'loading' | 'ready' | 'error';

export interface UseProductividadResult {
  filas: FilaProductividad[];
  status: UseProductividadStatus;
  error: string | null;
  retry: () => void;
}

/** Pure — the single source of the request URL for both hook and tests. */
export function buildProductividadPath(desde: string, hasta: string): string {
  return `/api/crm/productividad?desde=${desde}&hasta=${hasta}`;
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isProductividadSuccess(
  v: unknown,
): v is { success: true; filas: FilaProductividad[] } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && isArray(obj.filas);
}

export function useProductividad(desde: string, hasta: string): UseProductividadResult {
  const [filas, setFilas] = useState<FilaProductividad[]>([]);
  const [status, setStatus] = useState<UseProductividadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Invalidates in-flight responses after a retry/period change (useCartera model).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (periodoDesde: string, periodoHasta: string, isRetry: boolean) => {
      const requestId = ++requestIdRef.current;
      if (isRetry) setStatus('loading');
      setError(null);

      try {
        const response = await fetch(buildProductividadPath(periodoDesde, periodoHasta), {
          method: 'GET',
        });
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setFilas([]);
          return;
        }
        if (!isProductividadSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setFilas([]);
          return;
        }
        setStatus('ready');
        setFilas(json.filas);
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setFilas([]);
      }
    },
    [],
  );

  // Initial fetch + re-fetch when the selected period changes (the
  // setState calls inside this data-fetching effect report the fetch
  // lifecycle — the documented contract of this hook).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    setStatus('loading');
    void fetchOnce(desde, hasta, false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce, desde, hasta]);

  const retry = useCallback(() => {
    void fetchOnce(desde, hasta, true);
  }, [fetchOnce, desde, hasta]);

  return { filas, status, error, retry };
}
