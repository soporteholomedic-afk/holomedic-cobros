'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Empresa, TipoEmpresa } from '../../domain/entities';

/**
 * useEmpresas(filtros) — client hook that loads the filtered empresa
 * registry (spec G1 list) from `/api/crm/empresas`.
 *
 * Status machine (useCobranzaHistorial model):
 *   'loading' — request in flight (initial load, filter change or retry)
 *   'ready'   — 200 with the rows (an EMPTY list is a valid
 *               "no results" state, not a separate state)
 *   'error'   — non-OK response, unexpected shape or network failure
 *
 * Design contract: fetch-only — the API route is the boundary; no
 * repository is imported here (hexagonal, cobranza precedent).
 * Stale-guard + unmount safety via request ids. The filters object is
 * collapsed to a primitive query string before it becomes an effect
 * dependency, so refetches happen only when the effective query changes
 * (rerender-dependencies rule).
 */

export interface EmpresasFiltros {
  /** Free-text search over razón social / RUC; '' disables the filter. */
  q: string;
  /** '' = all types. */
  tipo: '' | TipoEmpresa;
}

export type UseEmpresasStatus = 'loading' | 'ready' | 'error';

export interface UseEmpresasResult {
  empresas: Empresa[];
  status: UseEmpresasStatus;
  error: string | null;
  retry: () => void;
}

/** Pure — the single source of the request URL for both hook and tests. */
export function buildEmpresasQuery(filtros: EmpresasFiltros): string {
  const params = new URLSearchParams();
  const q = filtros.q.trim();
  if (q !== '') params.set('q', q);
  if (filtros.tipo !== '') params.set('tipo', filtros.tipo);
  const qs = params.toString();
  return qs === '' ? '/api/crm/empresas' : `/api/crm/empresas?${qs}`;
}

function isEmpresa(v: unknown): v is Empresa {
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

function isApiSuccess(v: unknown): v is { success: true; empresas: Empresa[] } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && Array.isArray(obj.empresas) && obj.empresas.every(isEmpresa);
}

export function useEmpresas(filtros: EmpresasFiltros): UseEmpresasResult {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [status, setStatus] = useState<UseEmpresasStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Stable per-effect-call identity; doubles as the retry counter and
  // invalidates in-flight responses when the query changes.
  const requestIdRef = useRef(0);
  // Mounted flag — setState after unmount defense (strict-mode safety).
  const mountedRef = useRef(true);

  const query = buildEmpresasQuery(filtros);

  const fetchOnce = useCallback(
    async (isRetry: boolean) => {
      const id = ++requestIdRef.current;
      // Only set `loading` on retries — the effect below owns the
      // initial/filter-change transition.
      if (isRetry) setStatus('loading');
      setError(null);

      try {
        const response = await fetch(query, { method: 'GET' });
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (id !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setEmpresas([]);
          return;
        }
        if (!isApiSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setEmpresas([]);
          return;
        }
        setStatus('ready');
        setEmpresas(json.empresas);
      } catch (err: unknown) {
        if (id !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setEmpresas([]);
      }
    },
    [query],
  );

  // Initial fetch + refetch on effective-query change (query is a
  // primitive string, so identity churn cannot retrigger this).
  useEffect(() => {
    // The setState calls inside this data-fetching effect report the
    // result of the fetch lifecycle — the documented contract of this
    // hook (useCobranzaHistorial precedent).
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

  return { empresas, status, error, retry };
}
