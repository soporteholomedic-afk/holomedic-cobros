'use client';

import { useEffect, useState } from 'react';
import type { CompanyGroup, SpResultRow } from '@/types/sp-result';

export interface UseConsolidadosResultsReturn {
  rows: SpResultRow[];
  companies: CompanyGroup[];
  loading: boolean;
  error: string | null;
}

interface ConsolidadosResultsPayload {
  rows?: SpResultRow[];
  companies?: CompanyGroup[];
}

/**
 * Shared data hook for the `/consolidados` views.
 *
 * Issues a single `GET /api/consolidados/results?fechaInicio=…&fechaFin=…`
 * and returns both the raw `rows` (used by the patients list) and the
 * `companies` projection (used by the company cards). Aborts in-flight
 * requests on unmount or on date change.
 *
 * The optional `retryNonce` parameter lets consumers (e.g. an error-state
 * "Reintentar" button) force a re-fetch without changing the dates. The
 * base contract (return shape per R-HK-3) is preserved.
 *
 * Spec: R-HK-1..5.
 */
export function useConsolidadosResults(
  fechaInicio: string,
  fechaFin: string,
  retryNonce: number = 0,
): UseConsolidadosResultsReturn {
  const [rows, setRows] = useState<SpResultRow[]>([]);
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // Reset on params change (R-HK-5) — must happen before the fetch starts.
    // Defer to next microtask to avoid react-hooks/set-state-in-effect.
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
    });

    const queryParams = new URLSearchParams();
    if (fechaInicio) queryParams.set('fechaInicio', fechaInicio);
    if (fechaFin) queryParams.set('fechaFin', fechaFin);

    const url = `/api/consolidados/results?${queryParams.toString()}`;

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ConsolidadosResultsPayload>;
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setCompanies(data.companies ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Error al cargar los datos. Intente nuevamente.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [fechaInicio, fechaFin, retryNonce]);

  return { rows, companies, loading, error };
}
