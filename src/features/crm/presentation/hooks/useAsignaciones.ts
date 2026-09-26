'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AsignacionHistorial } from '../../domain/ports';

/**
 * useAsignaciones(empresaId) — client hook backing the per-empresa
 * assignment panel (tasks pr15/WU2, spec G5): the history read plus
 * the two mutations. Fetch-only (useColaHoy precedent — the API route
 * is the boundary).
 *
 * - `empresaId: null` (panel closed) → status 'idle', zero requests.
 * - A non-null id loads GET .../asignaciones (newest first).
 * - `asignar(responsable)` POSTs pr14's .../asignar with {responsable};
 *   `devolver()` POSTs .../devolver. A successful mutation refreshes
 *   the history and returns true (the caller refreshes the cartera);
 *   a failed one surfaces the API's Spanish message verbatim in
 *   `accionError` and returns false.
 */

export type UseAsignacionesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseAsignacionesResult {
  asignaciones: AsignacionHistorial[];
  status: UseAsignacionesStatus;
  /** History-load error. */
  error: string | null;
  /** asignar/devolver error (Spanish, verbatim from the API). */
  accionError: string | null;
  /** true while a mutation POST is in flight (button disabling). */
  accionEnCurso: boolean;
  asignar: (responsable: string) => Promise<boolean>;
  devolver: () => Promise<boolean>;
}

/** Pure path builders — single source for hook and tests. */
export function buildAsignacionesPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/asignaciones`;
}
export function buildAsignarPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/asignar`;
}
export function buildDevolverPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/devolver`;
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isHistorialSuccess(
  v: unknown,
): v is { success: true; asignaciones: AsignacionHistorial[] } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && isArray(obj.asignaciones);
}

async function extraerError(response: Response): Promise<string> {
  const json: unknown = await response.json().catch(() => ({}));
  const apiError = (json as { error?: unknown }).error;
  return typeof apiError === 'string' ? apiError : `HTTP ${response.status}`;
}

export function useAsignaciones(empresaId: number | null): UseAsignacionesResult {
  const [asignaciones, setAsignaciones] = useState<AsignacionHistorial[]>([]);
  const [status, setStatus] = useState<UseAsignacionesStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const cargarHistorial = useCallback(async (id: number) => {
    const requestId = ++requestIdRef.current;
    setError(null);

    try {
      const response = await fetch(buildAsignacionesPath(id), { method: 'GET' });
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestIdRef.current || !mountedRef.current) return;

      if (!response.ok) {
        setStatus('error');
        setError(await extraerError(response));
        setAsignaciones([]);
        return;
      }
      if (!isHistorialSuccess(json)) {
        setStatus('error');
        setError('Respuesta inesperada del servidor');
        setAsignaciones([]);
        return;
      }
      setStatus('ready');
      setAsignaciones(json.asignaciones);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Error de red');
      setAsignaciones([]);
    }
  }, []);

  // History lifecycle: idle when closed, loading → ready | error when open
  // (the setState calls inside this data-fetching effect report the fetch
  // lifecycle — the documented contract of this hook family).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (empresaId === null) {
      requestIdRef.current++;
      setStatus('idle');
      setAsignaciones([]);
      setError(null);
      setAccionError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    setStatus('loading');
    void cargarHistorial(empresaId);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [cargarHistorial, empresaId]);

  const ejecutarAccion = useCallback(
    async (hacer: (id: number) => Promise<Response>): Promise<boolean> => {
      if (empresaId === null || accionEnCurso) return false;
      setAccionEnCurso(true);
      setAccionError(null);
      try {
        const response = await hacer(empresaId);
        if (!mountedRef.current) return false;
        if (!response.ok) {
          setAccionError(await extraerError(response));
          return false;
        }
        await cargarHistorial(empresaId);
        return true;
      } catch (err: unknown) {
        if (mountedRef.current) {
          setAccionError(err instanceof Error ? err.message : 'Error de red');
        }
        return false;
      } finally {
        if (mountedRef.current) setAccionEnCurso(false);
      }
    },
    [accionEnCurso, cargarHistorial, empresaId],
  );

  const asignar = useCallback(
    (responsable: string) =>
      ejecutarAccion((id) =>
        fetch(buildAsignarPath(id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responsable }),
        }),
      ),
    [ejecutarAccion],
  );

  const devolver = useCallback(
    () =>
      ejecutarAccion((id) =>
        fetch(buildDevolverPath(id), { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
      ),
    [ejecutarAccion],
  );

  return { asignaciones, status, error, accionError, accionEnCurso, asignar, devolver };
}
