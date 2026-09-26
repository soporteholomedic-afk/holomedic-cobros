'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetalleEmpresa } from '../../application/obtenerDetalleEmpresa';

/**
 * useEmpresaDetalle(id) — client hook that loads the detail read model
 * (empresa aggregate + pipeline row + transition/handoff histories,
 * tasks pr11/WU1) from `/api/crm/empresas/[id]/detalle`.
 *
 * Status machine (useEmpresas model):
 *   'loading' — request in flight (initial load or retry/refresh)
 *   'ready'   — 200 with the detail (pipeline may be null — valid)
 *   'error'   — non-OK response (404 included), unexpected shape,
 *               invalid id or network failure
 *
 * Design contract: fetch-only — the API route is the boundary; no
 * repository is imported here (hexagonal, useEmpresas precedent).
 * `refresh()` re-runs the fetch after a mutation (transition, tipo
 * change) so the parent page shows fresh state without a reload.
 */

export type UseEmpresaDetalleStatus = 'loading' | 'ready' | 'error';

export interface UseEmpresaDetalleResult {
  detalle: DetalleEmpresa | null;
  status: UseEmpresaDetalleStatus;
  error: string | null;
  retry: () => void;
  /** Post-mutation reload — identical to retry, named for intent. */
  refresh: () => void;
}

/** Pure — the single source of the request URL for both hook and tests. */
export function buildDetallePath(id: number): string {
  return `/api/crm/empresas/${id}/detalle`;
}

function isEmpresaValida(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.id === 'number' &&
    typeof obj.ruc === 'string' &&
    typeof obj.razonSocial === 'string' &&
    (obj.tipo === 'Cliente' || obj.tipo === 'Prospecto') &&
    Array.isArray(obj.contactos)
  );
}

function isDetalleSuccess(v: unknown): v is { success: true } & DetalleEmpresa {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    isEmpresaValida(obj.empresa) &&
    (obj.pipeline === null || typeof obj.pipeline === 'object') &&
    Array.isArray(obj.transiciones) &&
    Array.isArray(obj.handoffs)
  );
}

export function useEmpresaDetalle(id: number): UseEmpresaDetalleResult {
  const [detalle, setDetalle] = useState<DetalleEmpresa | null>(null);
  const [status, setStatus] = useState<UseEmpresaDetalleStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Stable per-effect-call identity; doubles as the retry counter and
  // invalidates in-flight responses (useEmpresas precedent).
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (isRetry: boolean) => {
      if (!Number.isInteger(id) || id <= 0) {
        setStatus('error');
        setError('"id" debe ser un número entero positivo');
        setDetalle(null);
        return;
      }
      const requestId = ++requestIdRef.current;
      // Only set `loading` on retries/refreshes — the effect below owns
      // the initial transition.
      if (isRetry) setStatus('loading');
      setError(null);

      try {
        const response = await fetch(buildDetallePath(id), { method: 'GET' });
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setDetalle(null);
          return;
        }
        if (!isDetalleSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setDetalle(null);
          return;
        }
        setStatus('ready');
        setDetalle({
          empresa: json.empresa,
          pipeline: json.pipeline,
          transiciones: json.transiciones,
          handoffs: json.handoffs,
        });
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setDetalle(null);
      }
    },
    [id],
  );

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

  const retry = useCallback(() => {
    void fetchOnce(true);
  }, [fetchOnce]);

  return { detalle, status, error, retry, refresh: retry };
}
