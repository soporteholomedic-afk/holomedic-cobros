/**
 * useCobranzaHistorial(ruc) — client hook that loads the per-client
 * cobranza communication audit history (REQ-02 R4).
 *
 * Status machine (useCompanyContact state-machine model):
 *   'loading' — GET /api/cobranza/historial/{ruc} in flight
 *   'ready'   — 200 with the rows (an EMPTY list is a valid
 *               "no sends yet" state, not a separate state)
 *   'error'   — non-OK response, unexpected shape or network failure
 *   'skipped' — trimmed ruc fails RUC_PATTERN: junk keys never hit
 *               the API at all (the audit log is write-only for
 *               them; the server 400 is defense in depth)
 *
 * Design contract: fetch-only — the API route is the boundary; no
 * repository is imported here (hexagonal, useCompanyContact
 * precedent). Stale-guard + unmount safety via request ids.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { RUC_PATTERN, type CobranzaEnvioHistorial } from '../../domain/entities';

export type CobranzaHistorialStatus = 'loading' | 'ready' | 'error' | 'skipped';

export interface UseCobranzaHistorialResult {
  envios: CobranzaEnvioHistorial[];
  status: CobranzaHistorialStatus;
  error: string | null;
  retry: () => void;
}

interface ApiSuccess {
  success: true;
  envios: CobranzaEnvioHistorial[];
}

interface ApiError {
  success?: false;
  error?: string;
}

function isCobranzaEnvioHistorial(v: unknown): v is CobranzaEnvioHistorial {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.id === 'number' &&
    typeof obj.ruc === 'string' &&
    Array.isArray(obj.destinatarios) &&
    typeof obj.asunto === 'string' &&
    (obj.estadoEnvio === 'SUCCESS' || obj.estadoEnvio === 'FAILED') &&
    typeof obj.enviadoPor === 'string' &&
    typeof obj.fechaEnvio === 'string'
  );
}

function isApiSuccess(v: unknown): v is ApiSuccess {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && Array.isArray(obj.envios) && obj.envios.every(isCobranzaEnvioHistorial);
}

export function useCobranzaHistorial(ruc: string): UseCobranzaHistorialResult {
  const [envios, setEnvios] = useState<CobranzaEnvioHistorial[]>([]);
  const [status, setStatus] = useState<CobranzaHistorialStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Stable per-effect-call identity; also doubles as the retry counter
  // and invalidates in-flight responses when the key changes.
  const requestIdRef = useRef(0);
  // Track mounted state to avoid setState after unmount (strict-mode
  // double-invoke defense, useCompanyContact precedent).
  const mountedRef = useRef(true);

  const esClaveValida = useCallback((key: string): boolean => RUC_PATTERN.test(key.trim()), []);

  const fetchOnce = useCallback(
    async (isRetry: boolean) => {
      const id = ++requestIdRef.current;
      // Only set `loading` when retrying — the initial fetch already
      // starts in `loading` (the mounting effect sets it explicitly
      // for the skip→valid transition, where the synchronous set is a
      // no-op on the initial mount).
      if (isRetry) {
        setStatus('loading');
      }
      setError(null);

      try {
        const url = `/api/cobranza/historial/${encodeURIComponent(ruc.trim())}`;
        const response = await fetch(url, { method: 'GET' });
        // Bail out if a newer request was started while this one was in flight.
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (id !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          // Extract once so the typeof guard narrows the const (a cast
          // expression is a new value on every read and never narrows).
          const apiError = (json as ApiError).error;
          const message = typeof apiError === 'string' ? apiError : `HTTP ${response.status}`;
          setStatus('error');
          setError(message);
          setEnvios([]);
          return;
        }
        if (!isApiSuccess(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setEnvios([]);
          return;
        }
        setStatus('ready');
        setEnvios(json.envios);
      } catch (err: unknown) {
        if (id !== requestIdRef.current || !mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Error de red';
        setStatus('error');
        setError(message);
        setEnvios([]);
      }
    },
    [ruc],
  );

  // Initial fetch + refetch on ruc change.
  useEffect(() => {
    // The setState calls inside this data-fetching effect report the
    // result of the guard/fetch lifecycle — the documented contract of
    // this hook (useCompanyContact precedent).
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (!esClaveValida(ruc)) {
      // Junk Excel keys are write-only in the audit log: nothing to
      // fetch. Invalidate any in-flight response from a previous key.
      requestIdRef.current += 1;
      setStatus('skipped');
      setEnvios([]);
      setError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    // Covers the skip→valid and error→valid prop transitions (no-op
    // on the initial mount, where state is already `loading`).
    setStatus('loading');
    void fetchOnce(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [fetchOnce, ruc, esClaveValida]);

  // Retry bumps the request id and re-invokes; junk keys stay skipped.
  const retry = useCallback(() => {
    if (!esClaveValida(ruc)) return;
    void fetchOnce(true);
  }, [fetchOnce, ruc, esClaveValida]);

  return { envios, status, error, retry };
}
