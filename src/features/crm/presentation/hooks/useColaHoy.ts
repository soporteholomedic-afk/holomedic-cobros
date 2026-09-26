'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ColaHoy } from '../../application/listarColaHoy';

/**
 * useColaHoy() — client hook that loads the daily queue (tasks
 * pr13/WU3) from `/api/crm/cola`. Fetch-only: the API route is the
 * boundary; no repository is imported here (useEmpresaDetalle
 * precedent). The queue is derived on request server-side — the hook
 * just renders what today's union of the sections is.
 *
 * Auto-refresh (crm-ux redesign): the board silently re-derives
 * itself every INTERVALO_ACTUALIZACION_MS and on window focus —
 * silent refreshes never flash the loading state and keep the stale
 * board on failure (stale-while-error); the manual retry stays the
 * loud path.
 *
 * Status machine: 'loading' (in flight) → 'ready' (200 with the
 * sections) | 'error' (non-OK response, unexpected shape or network
 * failure). `retry()` re-runs the fetch.
 */

export type UseColaHoyStatus = 'loading' | 'ready' | 'error';

export interface UseColaHoyResult {
  cola: ColaHoy | null;
  status: UseColaHoyStatus;
  error: string | null;
  retry: () => void;
}

/** Auto-refresh cadence (crm-ux redesign): the board must not lie. */
export const INTERVALO_ACTUALIZACION_MS = 30_000;

/** Single source of the request URL for both hook and tests. */
export function buildColaPath(): string {
  return '/api/crm/cola';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isColaSuccess(v: unknown): v is { success: true } & ColaHoy {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    isArray(obj.vencidasHoy) &&
    isArray(obj.reinicios) &&
    isArray(obj.decisionRequerida) &&
    isArray(obj.reactivables) &&
    isArray(obj.sinGestion)
  );
}

export function useColaHoy(): UseColaHoyResult {
  const [cola, setCola] = useState<ColaHoy | null>(null);
  const [status, setStatus] = useState<UseColaHoyStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Invalidates in-flight responses after a retry (useEmpresas model).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async (isRetry: boolean, silencioso = false) => {
    const requestId = ++requestIdRef.current;
    // Silent refreshes (auto-poll / focus) never flash the loading
    // state — the current board stays visible until new data lands.
    if (isRetry && !silencioso) setStatus('loading');
    if (!silencioso) setError(null);

    try {
      const response = await fetch(buildColaPath(), { method: 'GET' });
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestIdRef.current || !mountedRef.current) return;

      if (!response.ok) {
        // Silent failures keep the stale board (stale-while-error) —
        // only user-driven fetches surface the error.
        if (silencioso) return;
        const apiError = (json as { error?: unknown }).error;
        setStatus('error');
        setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
        setCola(null);
        return;
      }
      if (!isColaSuccess(json)) {
        if (silencioso) return;
        setStatus('error');
        setError('Respuesta inesperada del servidor');
        setCola(null);
        return;
      }
      setStatus('ready');
      setCola({
        vencidasHoy: json.vencidasHoy,
        reinicios: json.reinicios,
        decisionRequerida: json.decisionRequerida,
        reactivables: json.reactivables,
        sinGestion: json.sinGestion,
      });
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      if (silencioso) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error de red');
      setCola(null);
    }
  }, []);

  // Initial fetch (the setState calls inside this data-fetching effect
  // report the fetch lifecycle — the documented contract of this hook).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    setStatus('loading');
    void fetchOnce(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce]);

  // Auto-refresh (crm-ux redesign): the board re-derives itself every
  // 30s and whenever the tab regains focus — silently, so the current
  // cards never flash away. Hidden tabs skip the poll (visibility).
  useEffect(() => {
    const refrescar = (): void => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnce(true, true);
    };
    const intervalo = setInterval(refrescar, INTERVALO_ACTUALIZACION_MS);
    window.addEventListener('focus', refrescar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('focus', refrescar);
    };
  }, [fetchOnce]);

  const retry = useCallback(() => {
    void fetchOnce(true);
  }, [fetchOnce]);

  return { cola, status, error, retry };
}
