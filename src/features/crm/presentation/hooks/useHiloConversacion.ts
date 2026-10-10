'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversacionCrm, MensajeCrm } from '../../domain/entities';
import type { ContactoConEmpresa } from '../../domain/ports';
import type { NuevoContactoVinculacion } from '../../application/vincularConversacion';
import { esCandidatosContacto, esHiloConversacion, esMensajeCrm } from '../components/conversaciones/guards';

/**
 * useHiloConversacion(id) — client hook behind the bandeja's center
 * column (agente-ia-crm E1): loads the thread (GET [id] — delivering
 * the hilo already marks it read server-side), sends ONE manual reply
 * (POST [id]/mensajes) and resolves a PENDIENTE_VINCULACION (POST
 * [id]/vincular). Fetch-only, useEmpresas model. A failed reply NEVER
 * throws to the composer: it lands in `errorEnvio` so the draft text
 * survives; `vincular` reloads the hilo on success.
 */

export const DEBOUNCE_CANDIDATOS_MS = 300;
export const MIN_BUSQUEDA_CANDATOS = 2;

export function buildHiloPath(id: number): string {
  return `/api/crm/conversaciones/${id}`;
}

export interface HiloCargado {
  conversacion: ConversacionCrm;
  mensajes: MensajeCrm[];
}

export type UseHiloConversacionStatus = 'idle' | 'loading' | 'ready' | 'error';

export type EntradaVincularUi =
  | { modo: 'asociar'; contactoId: number }
  | { modo: 'crear'; nuevoContacto: NuevoContactoVinculacion };

export interface UseHiloConversacionResult {
  hilo: HiloCargado | null;
  status: UseHiloConversacionStatus;
  error: string | null;
  /** Reply send state; the error stays visible until cleared. */
  enviando: boolean;
  errorEnvio: string | null;
  limpiarErrorEnvio: () => void;
  /** true → the reply landed (mensaje appended). false → errorEnvio. */
  enviarMensaje: (cuerpo: string) => Promise<boolean>;
  /** Vincular + reload the hilo. true → linked (caller refreshes list). */
  vincular: (entrada: EntradaVincularUi) => Promise<boolean>;
  vinculando: boolean;
  errorVinculacion: string | null;
  recargar: () => void;
}

export function useHiloConversacion(conversacionId: number | null): UseHiloConversacionResult {
  const [hilo, setHilo] = useState<HiloCargado | null>(null);
  const [status, setStatus] = useState<UseHiloConversacionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [errorVinculacion, setErrorVinculacion] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(
    async (id: number, isRetry: boolean) => {
      const requestId = ++requestIdRef.current;
      if (isRetry) setStatus('loading');
      setError(null);

      try {
        const response = await fetch(buildHiloPath(id), { method: 'GET' });
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (requestId !== requestIdRef.current || !mountedRef.current) return;

        if (!response.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          setHilo(null);
          return;
        }
        if (!esHiloConversacion(json)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setHilo(null);
          return;
        }
        setStatus('ready');
        setHilo({ conversacion: json.conversacion, mensajes: json.mensajes });
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setHilo(null);
      }
    },
    [],
  );

  // Carga al seleccionar (y recarga al cambiar de conversación). null
  // → idle: sin columna central hasta que haya selección.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (conversacionId === null) {
      requestIdRef.current++;
      setStatus('idle');
      setHilo(null);
      setError(null);
      return () => {
        mountedRef.current = false;
      };
    }
    setStatus('loading');
    void fetchOnce(conversacionId, false);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [conversacionId, fetchOnce]);

  const recargar = useCallback(() => {
    if (conversacionId !== null) void fetchOnce(conversacionId, true);
  }, [conversacionId, fetchOnce]);

  const limpiarErrorEnvio = useCallback(() => setErrorEnvio(null), []);

  const enviarMensaje = useCallback(
    async (cuerpo: string): Promise<boolean> => {
      if (conversacionId === null) return false;
      setEnviando(true);
      setErrorEnvio(null);
      try {
        const response = await fetch(`${buildHiloPath(conversacionId)}/mensajes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cuerpo }),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok || (json as { success?: unknown }).success !== true) {
          const apiError = (json as { error?: unknown }).error;
          setErrorEnvio(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          return false; // el borrador NO se pierde
        }
        const mensaje = (json as { mensaje?: unknown }).mensaje;
        if (!esMensajeCrm(mensaje)) {
          setErrorEnvio('Respuesta inesperada del servidor');
          return false;
        }
        setHilo((previo) =>
          previo === null ? previo : { ...previo, mensajes: [...previo.mensajes, mensaje] },
        );
        return true;
      } catch (err: unknown) {
        setErrorEnvio(err instanceof Error ? err.message : 'Error de red');
        return false;
      } finally {
        setEnviando(false);
      }
    },
    [conversacionId],
  );

  const vincular = useCallback(
    async (entrada: EntradaVincularUi): Promise<boolean> => {
      if (conversacionId === null) return false;
      setVinculando(true);
      setErrorVinculacion(null);
      try {
        const response = await fetch(`${buildHiloPath(conversacionId)}/vincular`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entrada),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok || (json as { success?: unknown }).success !== true) {
          const apiError = (json as { error?: unknown }).error;
          setErrorVinculacion(typeof apiError === 'string' ? apiError : `HTTP ${response.status}`);
          return false;
        }
        await fetchOnce(conversacionId, true); // hilo ya TOMADA_HUMANO
        return true;
      } catch (err: unknown) {
        setErrorVinculacion(err instanceof Error ? err.message : 'Error de red');
        return false;
      } finally {
        setVinculando(false);
      }
    },
    [conversacionId, fetchOnce],
  );

  return {
    hilo,
    status,
    error,
    enviando,
    errorEnvio,
    limpiarErrorEnvio,
    enviarMensaje,
    vincular,
    vinculando,
    errorVinculacion,
    recargar,
  };
}

/**
 * useCandidatosContacto(conversacionId, busqueda) — the debounced
 * search behind PanelVinculacion's "Asociar contacto" tab: only fires
 * for terms ≥ MIN_BUSQUEDA_CANDATOS chars (the route 400s below
 * that), idle otherwise. Exported from this file (not hooks/) because
 * it belongs to the hilo's vinculación flow.
 */
export type UseCandidatosStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseCandidatosResult {
  candidatos: ContactoConEmpresa[];
  status: UseCandidatosStatus;
}

export function useCandidatosContacto(
  conversacionId: number,
  busqueda: string,
): UseCandidatosResult {
  const [candidatos, setCandidatos] = useState<ContactoConEmpresa[]>([]);
  const [status, setStatus] = useState<UseCandidatosStatus>('idle');
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // Los setState de esta rama reportan el ciclo de vida del buscador
    // (contrato documentado del hook — useEmpresas precedent): un
    // término corto resetea la búsqueda a idle de inmediato.
    mountedRef.current = true;
    const termino = busqueda.trim();
    if (termino.length < MIN_BUSQUEDA_CANDATOS) {
      requestIdRef.current++;
      setStatus('idle');
      setCandidatos([]);
      return () => {
        mountedRef.current = false;
      };
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    const timer = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setStatus('loading');
      try {
        const params = new URLSearchParams({ busqueda: termino });
        const response = await fetch(
          `/api/crm/conversaciones/${conversacionId}/candidatos?${params.toString()}`,
          { method: 'GET' },
        );
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        const json: unknown = await response.json().catch(() => ({}));
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        if (!response.ok || !esCandidatosContacto(json)) {
          setStatus('error');
          setCandidatos([]);
          return;
        }
        setStatus('ready');
        setCandidatos(json.candidatos);
      } catch {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setCandidatos([]);
      }
    }, DEBOUNCE_CANDIDATOS_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [conversacionId, busqueda]);

  return { candidatos, status };
}
