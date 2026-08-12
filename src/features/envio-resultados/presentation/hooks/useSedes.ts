'use client';

import { useState, useEffect } from 'react';
import type { SedeRow } from '@/types/sp-result';

export interface UseSedesReturn {
  sedes: SedeRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the active SIGLA locations from `/api/consolidados/sedes`.
 *
 * Used by the `/consolidados` page to power the "Sede" filter. Uses a
 * cancellation flag so no state updates run after unmount.
 */
export function useSedes(): UseSedesReturn {
  const [sedes, setSedes] = useState<SedeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/consolidados/sedes')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ sedes: SedeRow[] }>;
      })
      .then((data) => {
        if (!cancelled) setSedes(data.sedes ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Error al cargar las sedes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { sedes, loading, error };
}
