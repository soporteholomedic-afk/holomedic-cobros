'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { derivarPanel, type PanelDerivado, type PanelPayload } from '../panelDerivado';

/**
 * usePanelCrm() — client hook that loads the operator panel (tasks
 * 8.1, design D4) from `/api/crm/panel`. Fetch-only: the API route is
 * the boundary; no repository is imported here (useColaHoy /
 * useEmpresaDetalle precedent). The payload {hoy, filas} is derived
 * CLIENT-SIDE via panelDerivado — KPIs, tab counts, search and per-row
 * statuses all come from this one derivation. `hoy` is the
 * SERVER-authoritative date from the response, never a client
 * Date.now() (batch-9 watch item), so every operator derives the same
 * panel state.
 *
 * Auto-refresh (crm-ux redesign): the panel silently re-derives itself
 * every INTERVALO_ACTUALIZACION_MS and on window focus — silent
 * refreshes never flash the loading state and keep the stale panel on
 * failure (stale-while-error); the manual retry stays the loud path.
 *
 * Status machine: 'loading' (in flight) → 'ready' (200 with the
 * payload) | 'error' (non-OK response, unexpected shape or network
 * failure). `retry()` re-runs the fetch.
 */

export type UsePanelCrmStatus = 'loading' | 'ready' | 'error';

export interface UsePanelCrmResult {
  panel: PanelDerivado | null;
  status: UsePanelCrmStatus;
  error: string | null;
  retry: () => void;
}

/** Auto-refresh cadence (crm-ux redesign): the panel must not lie.
 * Same cadence as the cola board; own constant so the panel hook does
 * not depend on the module retired in task 11.2. */
export const INTERVALO_ACTUALIZACION_MS = 30_000;

/** Single source of the request URL for both hook and tests. */
export function buildPanelPath(): string {
  return '/api/crm/panel';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isPanelSuccess(v: unknown): v is { success: true } & PanelPayload {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true && typeof obj.hoy === 'string' && isArray(obj.filas) && obj.filas.every((f) => typeof f === 'object' && f !== null)
  );
}

export function usePanelCrm(): UsePanelCrmResult {
  const [panel, setPanel] = useState<PanelDerivado | null>(null);
  const [status, setStatus] = useState<UsePanelCrmStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Invalidates in-flight responses after a retry (useColaHoy model).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async (isRetry: boolean, silencioso = false) => {
    const requestId = ++requestIdRef.current;
    // Silent refreshes (auto-poll / focus) never flash the loading
    // state — the current panel stays visible until new data lands.
    if (isRetry && !silencioso) setStatus('loading');
    if (!silencioso) setError(null);

    try {
      const response = await fetch(buildPanelPath(), { method: 'GET' });
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestIdRef.current || !mountedRef.current) return;

      if (!response.ok) {
        // Silent failures keep the stale panel (stale-while-error) —
        // only user-driven fetches surface the error.
        if (silencioso) return;
        const apiError = (json as { error?: unknown }).error;
        setStatus('error');
        setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
        setPanel(null);
        return;
      }
      if (!isPanelSuccess(json)) {
        if (silencioso) return;
        setStatus('error');
        setError('Respuesta inesperada del servidor');
        setPanel(null);
        return;
      }
      setStatus('ready');
      setPanel(derivarPanel({ hoy: json.hoy, filas: json.filas }));
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      if (silencioso) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error de red');
      setPanel(null);
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

  // Auto-refresh (crm-ux redesign): the panel re-derives itself every
  // 30s and whenever the tab regains focus — silently, so the current
  // KPIs/table never flash away. Hidden tabs skip the poll (visibility).
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

  return { panel, status, error, retry };
}
