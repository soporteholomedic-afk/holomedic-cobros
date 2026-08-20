'use client';

import { useEffect, useState } from 'react';
import type { EnvioHistorySummary } from '@/features/envio-resultados/domain/entities';

export interface UseEnviosHistoryReturn {
  rows: EnvioHistorySummary[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
}

interface EnviosHistoryPayload {
  success?: boolean;
  rows?: EnvioHistorySummary[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

/** Shown before the first response arrives; the API always echoes 20. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Data hook for the `/consolidados/historial-envios` buscador (PR3).
 *
 * URL-param driven: the component parses `q`, `fechaInicio`, `fechaFin`
 * and `page` from the search params and passes them here; the hook
 * issues `GET /api/consolidados/envios` (PR2 contract — server-side
 * paged search) and exposes `{rows, total, page, pageSize, loading,
 * error}`. The optional `retryNonce` lets the error state's
 * "Reintentar" button force a re-fetch without changing the params.
 * In-flight requests are aborted on unmount or param change, mirroring
 * `useConsolidadosResults`.
 *
 * Spec: historial-envios-consolidados / History Page (data states).
 */
export function useEnviosHistory(
  q: string,
  fechaInicio: string,
  fechaFin: string,
  page: number,
  retryNonce: number = 0,
): UseEnviosHistoryReturn {
  const [rows, setRows] = useState<EnvioHistorySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [resultPage, setResultPage] = useState(page);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // Reset on params change — deferred to a microtask to avoid
    // set-state-in-effect warnings (useConsolidadosResults precedent).
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
    });

    const queryParams = new URLSearchParams();
    if (q) queryParams.set('q', q);
    if (fechaInicio) queryParams.set('fechaInicio', fechaInicio);
    if (fechaFin) queryParams.set('fechaFin', fechaFin);
    if (page > 1) queryParams.set('page', String(page));

    const query = queryParams.toString();

    fetch(`/api/consolidados/envios${query ? `?${query}` : ''}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EnviosHistoryPayload>;
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setResultPage(data.page ?? page);
        setPageSize(data.pageSize ?? DEFAULT_PAGE_SIZE);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Error al cargar el historial de envíos. Intente nuevamente.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [q, fechaInicio, fechaFin, page, retryNonce]);

  return { rows, total, page: resultPage, pageSize, loading, error };
}
