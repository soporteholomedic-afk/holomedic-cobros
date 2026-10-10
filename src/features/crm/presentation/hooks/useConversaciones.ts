'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversacionListada } from '../../domain/entities';
import { esListadoConversaciones } from '../components/conversaciones/guards';

/**
 * useConversaciones(busqueda) — client hook that loads the bandeja
 * (agente-ia-crm E1) from `/api/crm/conversaciones`.
 *
 * - Live search: `busqueda` is debounced DEBOUNCE_BUSQUEDA_MS before it
 *   becomes the effective query (one keystroke burst = one request);
 * - Light polling every INTERVALO_POLLING_MS (setInterval + abortable
 *   fetch, cleaned on unmount, hidden tabs skip — usePanelCrm
 *   precedent). Silent refreshes never flash the loading state and
 *   keep the stale list on failure (stale-while-error);
 * - `simularEntrada` POSTs `/simular` (mock-first demo) and refetches
 *   on success so the new conversation appears immediately.
 *
 * Fetch-only (useEmpresas model): the API route is the boundary; no
 * repository is imported here. `modoSimulado` comes from the server
 * body — the component layer never reads process.env.
 */

export const DEBOUNCE_BUSQUEDA_MS = 300;
export const INTERVALO_POLLING_MS = 15_000;

/** Single source of the request URL for both hook and tests. */
export function buildConversacionesQuery(busqueda: string): string {
  const params = new URLSearchParams();
  const termino = busqueda.trim();
  if (termino !== '') params.set('busqueda', termino);
  const qs = params.toString();
  return qs === '' ? '/api/crm/conversaciones' : `/api/crm/conversaciones?${qs}`;
}

export type UseConversacionesStatus = 'loading' | 'ready' | 'error';

export type ResultadoSimulacionUi =
  | { ok: true; conversacionId: number | null }
  | { ok: false; error: string };

export interface UseConversacionesResult {
  conversaciones: ConversacionListada[];
  total: number;
  /** Server-authoritative canal mode (KAPSO_MODO) for the simulator card. */
  modoSimulado: boolean;
  status: UseConversacionesStatus;
  error: string | null;
  /** Loud refresh (loading flash). `refetch(true)` = silent. */
  refetch: (silencioso?: boolean) => void;
  /** POST /api/crm/conversaciones/simular + refetch on success. */
  simularEntrada: (telefono: string, texto: string) => Promise<ResultadoSimulacionUi>;
}

export function useConversaciones(busqueda: string): UseConversacionesResult {
  // La búsqueda DEBOUNCEADA: la ventana evita una request por tecla.
  const [busquedaEfectiva, setBusquedaEfectiva] = useState(busqueda.trim());
  const [conversaciones, setConversaciones] = useState<ConversacionListada[]>([]);
  const [total, setTotal] = useState(0);
  const [modoSimulado, setModoSimulado] = useState(false);
  const [status, setStatus] = useState<UseConversacionesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  // Abort en vuelo al cambiar la query / desmontar (fetch abortable).
  const controllerRef = useRef<AbortController | null>(null);

  const query = buildConversacionesQuery(busquedaEfectiva);

  // Debounce: cada tecla reposiciona la ventana; solo el último valor
  // llega a ser la query efectiva.
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaEfectiva(busqueda.trim()), DEBOUNCE_BUSQUEDA_MS);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const fetchOnce = useCallback(
    async (isRetry: boolean, silencioso = false) => {
      const requestId = ++requestIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (isRetry && !silencioso) setStatus('loading');
      if (!silencioso) setError(null);

      try {
        const response = await fetch(query, { method: 'GET', signal: controller.signal });
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          if (silencioso) return; // stale-while-error
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setConversaciones([]);
          return;
        }
        if (!esListadoConversaciones(json)) {
          if (silencioso) return;
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setConversaciones([]);
          return;
        }
        setStatus('ready');
        setConversaciones(json.conversaciones);
        setTotal(json.total);
        setModoSimulado(json.modoSimulado);
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        if (silencioso) return;
        // Abort de una query reemplazada: no es un error del usuario.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setConversaciones([]);
      }
    },
    [query],
  );

  // Carga inicial + refetch al cambiar la query efectiva (primitiva →
  // identidad estable, useEmpresas precedent).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    setStatus('loading');
    void fetchOnce(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, [fetchOnce]);

  // Polling ligero (E1): la bandeja se refresca sola cada 15s mientras
  // la pestaña está visible; silencioso y abortable, limpio al salir.
  useEffect(() => {
    const refrescar = (): void => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnce(true, true);
    };
    const intervalo = setInterval(refrescar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [fetchOnce]);

  const refetch = useCallback(
    (silencioso = false) => {
      void fetchOnce(true, silencioso);
    },
    [fetchOnce],
  );

  const simularEntrada = useCallback(
    async (telefono: string, texto: string): Promise<ResultadoSimulacionUi> => {
      try {
        const response = await fetch('/api/crm/conversaciones/simular', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ telefono, texto }),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok || (json as { success?: unknown }).success !== true) {
          const apiError = (json as { error?: unknown }).error;
          return {
            ok: false,
            error: typeof apiError === 'string' ? apiError : `HTTP ${response.status}`,
          };
        }
        const conversacionId = (json as { conversacionId?: unknown }).conversacionId;
        fetchOnce(true, true); // la conversación nueva/movida aparece ya
        return { ok: true, conversacionId: typeof conversacionId === 'number' ? conversacionId : null };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
      }
    },
    [fetchOnce],
  );

  return { conversaciones, total, modoSimulado, status, error, refetch, simularEntrada };
}
