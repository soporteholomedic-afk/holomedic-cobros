/**
 * useSpitches(area, type) — client hook that fetches templates from
 * `/api/plantillas` (PR 4 — design Decision b, k).
 *
 * Returns:
 *   {
 *     spitches: SpitchDTO[],
 *     status: 'loading' | 'empty' | 'error' | 'populated',
 *     error?: string,
 *     retry: () => void,
 *   }
 *
 * Spec delta `envio-resultados` MODIFIED: "useSpitches hook" + "Hook
 * reports loading then populated" + "Hook reports empty" + "Hook
 * reports error with retry".
 *
 * Design contract: NO module-top instantiation. The hook fetches
 * via `fetch` (the only allowed pattern for client hooks; the API
 * is the boundary, no repository is imported here).
 *
 * Concurrency: a stale-response guard rejects out-of-order responses
 * (a slow earlier fetch must not overwrite a fast later one). The
 * `requestIdRef` increments on every retry and on every prop change.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SpitchDTO, SpitchType } from '../../domain/entities';

export type UseSpitchesStatus = 'loading' | 'empty' | 'error' | 'populated';

export interface UseSpitchesResult {
  spitches: SpitchDTO[];
  status: UseSpitchesStatus;
  error: string | null;
  retry: () => void;
}

interface ApiSuccess {
  spitches: SpitchDTO[];
}
interface ApiError {
  success?: false;
  error?: string;
}

function isApiSuccess(v: unknown): v is ApiSuccess {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.spitches);
}

export function useSpitches(area: string, type: SpitchType): UseSpitchesResult {
  const [spitches, setSpitches] = useState<SpitchDTO[]>([]);
  const [status, setStatus] = useState<UseSpitchesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Stable per-effect-call identity; also doubles as the retry counter.
  const requestIdRef = useRef(0);
  // Track mounted state to avoid setState after unmount (defensive —
  // the strict-mode double-invoke would otherwise log a warning).
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async () => {
    const id = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    try {
      const url = `/api/plantillas?area=${encodeURIComponent(area)}&type=${encodeURIComponent(type)}`;
      const response = await fetch(url, { method: 'GET' });
      // Bail out if a newer request was started while this one was in flight.
      if (id !== requestIdRef.current || !mountedRef.current) return;
      const json: unknown = await response.json().catch(() => ({}));
      if (id !== requestIdRef.current || !mountedRef.current) return;
      if (!response.ok) {
        const message =
          isApiSuccess(json) === false && typeof (json as ApiError).error === 'string'
            ? (json as ApiError).error ?? `HTTP ${response.status}`
            : `HTTP ${response.status}`;
        setStatus('error');
        setError(message);
        setSpitches([]);
        return;
      }
      if (!isApiSuccess(json)) {
        setStatus('error');
        setError('Respuesta inesperada del servidor');
        setSpitches([]);
        return;
      }
      if (json.spitches.length === 0) {
        setStatus('empty');
        setSpitches([]);
        return;
      }
      setStatus('populated');
      setSpitches(json.spitches);
    } catch (err: unknown) {
      if (id !== requestIdRef.current || !mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Error de red';
      setStatus('error');
      setError(message);
      setSpitches([]);
    }
  }, [area, type]);

  // Initial fetch + refetch on (area, type) change.
  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce]);

  // Retry bumps the request id and re-invokes.
  const retry = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { spitches, status, error, retry };
}
