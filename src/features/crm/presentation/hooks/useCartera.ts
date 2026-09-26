'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FilaCartera } from '../../application/listarCartera';

/**
 * useCartera() — client hook that loads the cartera (tasks pr15/WU2)
 * from `/api/crm/cartera`. Fetch-only: the API route is the boundary;
 * no repository is imported here (useColaHoy precedent). `todas` is
 * the admin "Ver todas" toggle — flipping it re-fetches with
 * `?todas=true`; the server keeps the scope honest (`todas` echoed
 * back is the EFFECTIVE scope, so a plain holder renders own-only
 * even if the toggle were somehow on).
 *
 * Status machine: 'loading' (in flight) → 'ready' (200 with the filas)
 * | 'error' (non-OK response, unexpected shape or network failure).
 * `retry()` and `refresh()` re-run the fetch (refresh is what the
 * assignment panel calls after a successful asignar/devolver).
 */

export type UseCarteraStatus = 'loading' | 'ready' | 'error';

export interface UseCarteraResult {
  filas: FilaCartera[];
  /** Effective scope echoed by the server (the UI toggle's truth). */
  todas: boolean;
  status: UseCarteraStatus;
  error: string | null;
  retry: () => void;
  refresh: () => void;
}

/** Pure — the single source of the request URL for both hook and tests. */
export function buildCarteraPath(todas: boolean): string {
  return todas ? '/api/crm/cartera?todas=true' : '/api/crm/cartera';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isCarteraSuccess(v: unknown): v is { success: true; filas: FilaCartera[]; todas: boolean } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && isArray(obj.filas) && typeof obj.todas === 'boolean';
}

export function useCartera(todas: boolean): UseCarteraResult {
  const [filas, setFilas] = useState<FilaCartera[]>([]);
  const [todasEfectivo, setTodasEfectivo] = useState(todas);
  const [status, setStatus] = useState<UseCarteraStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Invalidates in-flight responses after a retry/toggle (useEmpresas model).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (scopeTodas: boolean, isRetry: boolean) => {
      const requestId = ++requestIdRef.current;
      if (isRetry) setStatus('loading');
      setError(null);

      try {
        const response = await fetch(buildCarteraPath(scopeTodas), { method: 'GET' });
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
        if (!isCarteraSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setFilas([]);
          return;
        }
        setStatus('ready');
        setTodasEfectivo(json.todas);
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

  // Initial fetch + re-fetch on toggle change (the setState calls inside
  // this data-fetching effect report the fetch lifecycle — the
  // documented contract of this hook).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    setStatus('loading');
    void fetchOnce(todas, false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce, todas]);

  const retry = useCallback(() => {
    void fetchOnce(todas, true);
  }, [fetchOnce, todas]);

  const refresh = useCallback(() => {
    void fetchOnce(todas, false);
  }, [fetchOnce, todas]);

  return { filas, todas: todasEfectivo, status, error, retry, refresh };
}
