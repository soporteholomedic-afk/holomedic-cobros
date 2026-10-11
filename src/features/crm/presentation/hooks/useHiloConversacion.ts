'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CampoFicha,
  ConversacionCrm,
  FichaConversacion,
  MemoriaLista,
  MensajeCrm,
  NivelMemoria,
  TipoObservacionDestilada,
} from '../../domain/entities';
import type { ContactoConEmpresa } from '../../domain/ports';
import type { NuevoContactoVinculacion } from '../../application/vincularConversacion';
import {
  esAjustesConversacion,
  esCandidatosContacto,
  esFichaConversacion,
  esHiloConversacion,
  esListadoMemorias,
  esMensajeCrm,
  esSolicitudAyuda,
  esUsuariosAsignables,
  type AjustesConversacionVista,
  type SolicitudAyudaVista,
  type UsuarioAsignableVista,
} from '../components/conversaciones/guards';

/**
 * useHiloConversacion(id) — client hook behind the bandeja's center
 * column (agente-ia-crm E1): loads the thread (GET [id] — delivering
 * the hilo already marks it read server-side), sends ONE manual reply
 * (POST [id]/mensajes) and resolves a PENDIENTE_VINCULACION (POST
 * [id]/vincular). Fetch-only, useEmpresas model. A failed reply NEVER
 * throws to the composer: it lands in `errorEnvio` so the draft text
 * survives; `vincular` reloads the hilo on success.
 *
 * `versionActividad` es la señal de "hubo actividad nueva" (hoy
 * fila.ultimoMensajeEn del listado): cambia → recarga silenciosa del
 * hilo ya abierto; igual id + igual versión → no refetch.
 */

export const DEBOUNCE_CANDIDATOS_MS = 300;
export const MIN_BUSQUEDA_CANDATOS = 2;

export function buildHiloPath(id: number): string {
  return `/api/crm/conversaciones/${id}`;
}

export interface HiloCargado {
  conversacion: ConversacionCrm;
  mensajes: MensajeCrm[];
  /** E3·T5: the PENDIENTE help request feeding the thread's help card. */
  solicitudAyuda: SolicitudAyudaVista | null;
}

export type UseHiloConversacionStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Entrada del guardado manual de memoria (nueva / editar — E3·T5). */
export interface EntradaGuardarMemoriaUi {
  nivel: NivelMemoria;
  tipo: TipoObservacionDestilada;
  titulo: string;
  contenido: string;
  /** Edit flow: the observation replaced by eliminar + guardar. */
  reemplazaObservacionId?: number;
}

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
  // ---- E3·T5: right column (ficha / memorias / ajustes) ----
  /** The living contact card; loads with the thread on selection. */
  ficha: FichaConversacion | null;
  statusFicha: UseHiloConversacionStatus;
  errorFicha: string | null;
  /** The memory panel rows (own chat session + empresa session). */
  memorias: MemoriaLista[];
  /** The scoping empresa (null → conversation sin vincular). */
  empresaIdMemorias: number | null;
  statusMemorias: UseHiloConversacionStatus;
  errorMemorias: string | null;
  /** The per-conversation settings + public agent config. */
  ajustes: AjustesConversacionVista | null;
  statusAjustes: UseHiloConversacionStatus;
  errorAjustes: string | null;
  // ---- E3·T5: escalar targets (lazy — loaded when the selector opens) ----
  usuariosAsignables: UsuarioAsignableVista[];
  statusUsuarios: UseHiloConversacionStatus;
  errorUsuarios: string | null;
  cargarUsuariosAsignables: () => void;
  // ---- E3·T5: acciones del patrón de ayuda ----
  enviandoIndicacion: boolean;
  errorIndicacion: string | null;
  limpiarErrorIndicacion: () => void;
  /** true → indicación aplicada (hilo refetchado, tarjeta desaparece). */
  enviarIndicacion: (indicacion: string) => Promise<boolean>;
  /** tomar/devolver/escalar share one flag + error (mutually exclusive actions). */
  transicionando: boolean;
  errorTransicion: string | null;
  limpiarErrorTransicion: () => void;
  tomar: () => Promise<boolean>;
  devolver: () => Promise<boolean>;
  escalar: (usuarioId: string) => Promise<boolean>;
  confirmandoFicha: boolean;
  errorConfirmacionFicha: string | null;
  /** true → ficha refreshed from the POST response. */
  confirmarDatoFicha: (campo: CampoFicha, valor: string) => Promise<boolean>;
  alternandoMemoria: boolean;
  errorToggleMemoria: string | null;
  /** true → ajustes refreshed; false → the caller reverts its optimistic flip. */
  toggleMemoriaActiva: (activa: boolean) => Promise<boolean>;
  gestionandoMemoria: boolean;
  errorMemoriaAccion: string | null;
  pinearMemoria: (observacionId: number) => Promise<boolean>;
  eliminarMemoria: (observacionId: number) => Promise<boolean>;
  /** Nueva memoria, o edición (reemplazaObservacionId → eliminar + guardar). */
  guardarMemoria: (entrada: EntradaGuardarMemoriaUi) => Promise<boolean>;
}

/** Error text from a decoded failure body (HTTP fallback, pure). */
function mensajeError(json: unknown, status: number): string {
  const apiError = (json as { error?: unknown }).error;
  return typeof apiError === 'string' ? apiError : `HTTP ${status}`;
}

export function useHiloConversacion(
  conversacionId: number | null,
  versionActividad: string | null = null,
): UseHiloConversacionResult {
  const [hilo, setHilo] = useState<HiloCargado | null>(null);
  const [status, setStatus] = useState<UseHiloConversacionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [errorVinculacion, setErrorVinculacion] = useState<string | null>(null);
  // ---- E3·T5: help pattern + right column (ficha / memorias / ajustes) ----
  const [ficha, setFicha] = useState<FichaConversacion | null>(null);
  const [statusFicha, setStatusFicha] = useState<UseHiloConversacionStatus>('idle');
  const [errorFicha, setErrorFicha] = useState<string | null>(null);
  const [memorias, setMemorias] = useState<MemoriaLista[]>([]);
  const [empresaIdMemorias, setEmpresaIdMemorias] = useState<number | null>(null);
  const [statusMemorias, setStatusMemorias] = useState<UseHiloConversacionStatus>('idle');
  const [errorMemorias, setErrorMemorias] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<AjustesConversacionVista | null>(null);
  const [statusAjustes, setStatusAjustes] = useState<UseHiloConversacionStatus>('idle');
  const [errorAjustes, setErrorAjustes] = useState<string | null>(null);
  const [usuariosAsignables, setUsuariosAsignables] = useState<UsuarioAsignableVista[]>([]);
  const [statusUsuarios, setStatusUsuarios] = useState<UseHiloConversacionStatus>('idle');
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null);
  const [enviandoIndicacion, setEnviandoIndicacion] = useState(false);
  const [errorIndicacion, setErrorIndicacion] = useState<string | null>(null);
  const [transicionando, setTransicionando] = useState(false);
  const [errorTransicion, setErrorTransicion] = useState<string | null>(null);
  const [confirmandoFicha, setConfirmandoFicha] = useState(false);
  const [errorConfirmacionFicha, setErrorConfirmacionFicha] = useState<string | null>(null);
  const [alternandoMemoria, setAlternandoMemoria] = useState(false);
  const [errorToggleMemoria, setErrorToggleMemoria] = useState<string | null>(null);
  const [gestionandoMemoria, setGestionandoMemoria] = useState(false);
  const [errorMemoriaAccion, setErrorMemoriaAccion] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  // Ids por corriente (hilo/ficha/memorias/ajustes): un ref ÚNICO
  // descartaría el hilo en vuelo cuando un lateral arranca en paralelo.
  const requestFichaRef = useRef(0);
  const requestMemoriasRef = useRef(0);
  const requestAjustesRef = useRef(0);
  const mountedRef = useRef(true);
  // Marca del watcher de crecimiento: qué conversación y qué largo de
  // hilo ya vimos — solo un crecimiento REAL dispara el refetch lateral.
  const largoVistoRef = useRef<{ conversacionId: number; largo: number } | null>(null);

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
        setHilo({
          conversacion: json.conversacion,
          mensajes: json.mensajes,
          solicitudAyuda: json.solicitudAyuda !== undefined && esSolicitudAyuda(json.solicitudAyuda)
            ? json.solicitudAyuda
            : null,
        });
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current || !mountedRef.current) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Error de red');
        setHilo(null);
      }
    },
    [],
  );

  // Carga al seleccionar (y recarga al cambiar de conversación o al
  // detectar actividad nueva via versionActividad). null → idle: sin
  // columna central hasta que haya selección.
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
  }, [conversacionId, versionActividad, fetchOnce]);

  const recargar = useCallback(() => {
    if (conversacionId !== null) void fetchOnce(conversacionId, true);
  }, [conversacionId, fetchOnce]);

  // ---- E3·T5: side column loads ----

  const fetchFicha = useCallback(async (id: number): Promise<void> => {
    const requestId = ++requestFichaRef.current;
    setStatusFicha('loading');
    setErrorFicha(null);
    try {
      const response = await fetch(`${buildHiloPath(id)}/ficha`, { method: 'GET' });
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestFichaRef.current || !mountedRef.current) return;
      if (!response.ok || !esFichaConversacion(json)) {
        setStatusFicha('error');
        setErrorFicha(!response.ok ? mensajeError(json, response.status) : 'Respuesta inesperada del servidor');
        setFicha(null);
        return;
      }
      setStatusFicha('ready');
      setFicha({
        conversacionId: json.conversacionId,
        contacto: json.contacto,
        empresa: json.empresa,
        datos: json.datos,
      });
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      setStatusFicha('error');
      setErrorFicha(err instanceof Error ? err.message : 'Error de red');
      setFicha(null);
    }
  }, []);

  const fetchMemorias = useCallback(async (id: number): Promise<void> => {
    const requestId = ++requestMemoriasRef.current;
    setStatusMemorias('loading');
    setErrorMemorias(null);
    try {
      const response = await fetch(`${buildHiloPath(id)}/memorias`, { method: 'GET' });
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestMemoriasRef.current || !mountedRef.current) return;
      if (!response.ok || !esListadoMemorias(json)) {
        setStatusMemorias('error');
        setErrorMemorias(!response.ok ? mensajeError(json, response.status) : 'Respuesta inesperada del servidor');
        setMemorias([]);
        return;
      }
      setStatusMemorias('ready');
      setMemorias(json.memorias);
      setEmpresaIdMemorias(json.empresaId);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      setStatusMemorias('error');
      setErrorMemorias(err instanceof Error ? err.message : 'Error de red');
      setMemorias([]);
    }
  }, []);

  const fetchAjustes = useCallback(async (id: number): Promise<void> => {
    const requestId = ++requestAjustesRef.current;
    setStatusAjustes('loading');
    setErrorAjustes(null);
    try {
      const response = await fetch(`${buildHiloPath(id)}/ajustes`, { method: 'GET' });
      const json: unknown = await response.json().catch(() => ({}));
      if (requestId !== requestAjustesRef.current || !mountedRef.current) return;
      if (!response.ok || !esAjustesConversacion(json)) {
        setStatusAjustes('error');
        setErrorAjustes(!response.ok ? mensajeError(json, response.status) : 'Respuesta inesperada del servidor');
        setAjustes(null);
        return;
      }
      setStatusAjustes('ready');
      setAjustes(json);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      setStatusAjustes('error');
      setErrorAjustes(err instanceof Error ? err.message : 'Error de red');
      setAjustes(null);
    }
  }, []);

  const cargarLaterales = useCallback(
    (id: number) => {
      void fetchFicha(id);
      void fetchMemorias(id);
      void fetchAjustes(id);
    },
    [fetchFicha, fetchMemorias, fetchAjustes],
  );

  // Carga de los laterales al seleccionar (misma señal que el hilo:
  // cambio de conversación). null → idle: sin columna derecha.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    mountedRef.current = true;
    if (conversacionId === null) {
      requestFichaRef.current++;
      requestMemoriasRef.current++;
      requestAjustesRef.current++;
      setStatusFicha('idle');
      setFicha(null);
      setErrorFicha(null);
      setStatusMemorias('idle');
      setMemorias([]);
      setEmpresaIdMemorias(null);
      setErrorMemorias(null);
      setStatusAjustes('idle');
      setAjustes(null);
      setErrorAjustes(null);
      largoVistoRef.current = null;
      return () => {
        mountedRef.current = false;
      };
    }
    cargarLaterales(conversacionId);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      mountedRef.current = false;
    };
  }, [conversacionId, cargarLaterales]);

  //Watcher de crecimiento: cuando el hilo YA cargado gana mensajes
  //(respuesta de la Guía que llegó por polling / devolución), las
  //nuevas destilaciones y extracciones aterrizan en los laterales —
  //refetch silencioso de los tres paneles. La PRIMERA vista de cada
  //conversación solo registra la marca (el efecto de selección ya
  //cargó los laterales en paralelo con el hilo).
  useEffect(() => {
    if (hilo === null) return;
    const marca = largoVistoRef.current;
    if (marca === null || marca.conversacionId !== hilo.conversacion.id) {
      largoVistoRef.current = { conversacionId: hilo.conversacion.id, largo: hilo.mensajes.length };
      return;
    }
    if (hilo.mensajes.length > marca.largo) {
      marca.largo = hilo.mensajes.length;
      cargarLaterales(hilo.conversacion.id);
    }
  }, [hilo, cargarLaterales]);

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

  // ---- E3·T5: acciones del patrón de ayuda ----

  const limpiarErrorIndicacion = useCallback(() => setErrorIndicacion(null), []);

  /** POST genérico de acción: true + success, false + su error inline. */
  async function postAccion(
    ruta: string,
    cuerpo: Record<string, unknown>,
  ): Promise<{ ok: boolean; json: unknown }> {
    try {
      const response = await fetch(ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const json: unknown = await response.json().catch(() => ({}));
      return { ok: response.ok, json };
    } catch (err: unknown) {
      return { ok: false, json: { error: err instanceof Error ? err.message : 'Error de red' } };
    }
  }

  /**
   * Enviar la indicación que resuelve la solicitud PENDIENTE: al
   * éxito se refetcha el hilo (la tarjeta desaparece — la respuesta
   * de la Guía llega después por polling) y las memorias (la
   * indicación se guarda pineada del lado del servidor).
   */
  const enviarIndicacion = useCallback(
    async (indicacion: string): Promise<boolean> => {
      if (conversacionId === null) return false;
      setEnviandoIndicacion(true);
      setErrorIndicacion(null);
      const { ok, json } = await postAccion(`${buildHiloPath(conversacionId)}/indicacion`, {
        indicacion,
      });
      if (!ok || (json as { success?: unknown }).success !== true) {
        setErrorIndicacion(mensajeError(json, 0));
        setEnviandoIndicacion(false);
        return false;
      }
      await fetchOnce(conversacionId, true);
      void fetchMemorias(conversacionId);
      setEnviandoIndicacion(false);
      return true;
    },
    [conversacionId, fetchOnce, fetchMemorias],
  );

  const limpiarErrorTransicion = useCallback(() => setErrorTransicion(null), []);

  /** Transición de estado (tomar/devolver/escalar): refetch hilo+ajustes. */
  const transicionar = useCallback(
    async (sufijo: string, cuerpo: Record<string, unknown>): Promise<boolean> => {
      if (conversacionId === null) return false;
      setTransicionando(true);
      setErrorTransicion(null);
      const { ok, json } = await postAccion(`${buildHiloPath(conversacionId)}${sufijo}`, cuerpo);
      if (!ok || (json as { success?: unknown }).success !== true) {
        setErrorTransicion(mensajeError(json, 0));
        setTransicionando(false);
        return false;
      }
      await fetchOnce(conversacionId, true);
      void fetchAjustes(conversacionId);
      setTransicionando(false);
      return true;
    },
    [conversacionId, fetchOnce, fetchAjustes],
  );

  const tomar = useCallback(async () => transicionar('/tomar', {}), [transicionar]);
  const devolver = useCallback(async () => transicionar('/devolver', {}), [transicionar]);
  const escalar = useCallback(
    async (usuarioId: string) => transicionar('/escalar', { usuarioId }),
    [transicionar],
  );

  const confirmarDatoFicha = useCallback(
    async (campo: CampoFicha, valor: string): Promise<boolean> => {
      if (conversacionId === null) return false;
      setConfirmandoFicha(true);
      setErrorConfirmacionFicha(null);
      const { ok, json } = await postAccion(`${buildHiloPath(conversacionId)}/ficha`, {
        campo,
        valor,
      });
      if (!ok || !esFichaConversacion(json)) {
        setErrorConfirmacionFicha(ok ? 'Respuesta inesperada del servidor' : mensajeError(json, 0));
        setConfirmandoFicha(false);
        return false;
      }
      setFicha({
        conversacionId: json.conversacionId,
        contacto: json.contacto,
        empresa: json.empresa,
        datos: json.datos,
      });
      setConfirmandoFicha(false);
      return true;
    },
    [conversacionId],
  );

  const toggleMemoriaActiva = useCallback(
    async (activa: boolean): Promise<boolean> => {
      if (conversacionId === null) return false;
      setAlternandoMemoria(true);
      setErrorToggleMemoria(null);
      const { ok, json } = await postAccion(`${buildHiloPath(conversacionId)}/ajustes`, {
        memoriaActiva: activa,
      });
      if (!ok || !esAjustesConversacion(json)) {
        setErrorToggleMemoria(ok ? 'Respuesta inesperada del servidor' : mensajeError(json, 0));
        setAlternandoMemoria(false);
        return false; // el caller revierte su flip optimista
      }
      setAjustes(json);
      setAlternandoMemoria(false);
      return true;
    },
    [conversacionId],
  );

  const gestionarMemoria = useCallback(
    async (cuerpo: Record<string, unknown>): Promise<boolean> => {
      if (conversacionId === null) return false;
      setErrorMemoriaAccion(null);
      const { ok, json } = await postAccion(
        `${buildHiloPath(conversacionId)}/memorias`,
        cuerpo,
      );
      if (!ok || (json as { ok?: unknown }).ok !== true) {
        setErrorMemoriaAccion(mensajeError(json, 0));
        return false;
      }
      await fetchMemorias(conversacionId);
      return true;
    },
    [conversacionId, fetchMemorias],
  );

  const pinearMemoria = useCallback(
    async (observacionId: number) => gestionarMemoria({ observacionId, accion: 'pinear' }),
    [gestionarMemoria],
  );
  const eliminarMemoria = useCallback(
    async (observacionId: number) => gestionarMemoria({ observacionId, accion: 'eliminar' }),
    [gestionarMemoria],
  );

  /**
   * Guardado manual (nueva memoria o edición): EDITAR = eliminar la
   * observación reemplazada y guardar la nueva (el puerto no tiene
   * update), todo con el flag de gestión y refetch final.
   */
  const guardarMemoria = useCallback(
    async (entrada: EntradaGuardarMemoriaUi): Promise<boolean> => {
      if (conversacionId === null) return false;
      setGestionandoMemoria(true);
      setErrorMemoriaAccion(null);
      let ok = true;
      if (entrada.reemplazaObservacionId !== undefined) {
        ok = await gestionarMemoria({ observacionId: entrada.reemplazaObservacionId, accion: 'eliminar' });
      }
      if (ok) {
        ok = await gestionarMemoria({
          accion: 'guardar',
          nivel: entrada.nivel,
          tipo: entrada.tipo,
          titulo: entrada.titulo,
          contenido: entrada.contenido,
        });
      }
      setGestionandoMemoria(false);
      return ok;
    },
    [conversacionId, gestionarMemoria],
  );

  /** Usuarios asignables — SOLO bajo demanda (al abrir Escalar a…). */
  const cargarUsuariosAsignables = useCallback((): void => {
    if (statusUsuarios === 'ready' || statusUsuarios === 'loading') return;
    setStatusUsuarios('loading');
    setErrorUsuarios(null);
    void (async () => {
      try {
        const response = await fetch('/api/crm/conversaciones/usuarios-asignables', {
          method: 'GET',
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!mountedRef.current) return;
        if (!response.ok || !esUsuariosAsignables(json)) {
          setStatusUsuarios('error');
          setErrorUsuarios(!response.ok ? mensajeError(json, response.status) : 'Respuesta inesperada del servidor');
          return;
        }
        setStatusUsuarios('ready');
        setUsuariosAsignables(json.usuarios);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setStatusUsuarios('error');
        setErrorUsuarios(err instanceof Error ? err.message : 'Error de red');
      }
    })();
  }, [statusUsuarios]);

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
    // E3·T5: side column
    ficha,
    statusFicha,
    errorFicha,
    memorias,
    empresaIdMemorias,
    statusMemorias,
    errorMemorias,
    ajustes,
    statusAjustes,
    errorAjustes,
    usuariosAsignables,
    statusUsuarios,
    errorUsuarios,
    cargarUsuariosAsignables,
    // E3·T5: acciones
    enviandoIndicacion,
    errorIndicacion,
    limpiarErrorIndicacion,
    enviarIndicacion,
    transicionando,
    errorTransicion,
    limpiarErrorTransicion,
    tomar,
    devolver,
    escalar,
    confirmandoFicha,
    errorConfirmacionFicha,
    confirmarDatoFicha,
    alternandoMemoria,
    errorToggleMemoria,
    toggleMemoriaActiva,
    gestionandoMemoria,
    errorMemoriaAccion,
    pinearMemoria,
    eliminarMemoria,
    guardarMemoria,
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
