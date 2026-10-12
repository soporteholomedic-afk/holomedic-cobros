'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * useIngestasConocimiento() — client hook behind /admin/crm/conocimiento
 * (agente-ia-crm E4·T8): lista las ingestas recientes (GET
 * ?limite=20), carga TEXTO pegado (POST JSON) o un archivo (POST
 * multipart) y mantiene el ESTADO EN VIVO: mientras alguna ingesta
 * está PENDIENTE/PROCESANDO, refresca cada
 * INTERVALO_POLLING_INGESTAS_MS (stale-while-error — un refresco que
 * falla conserva la lista en silencio, useNotificacionesConversaciones
 * precedent) y se detiene cuando todo está COMPLETADA/FALLIDA.
 *
 * Fetch-only, useHiloConversacion model: la lista jamás confía en un
 * body con forma inesperada (guard esIngestaVista) y un fallo de
 * carga NUNCA tira a la página — aterriza en `errorSubida` para que
 * el formulario sobreviva (borrador intacto).
 */

export const INTERVALO_POLLING_INGESTAS_MS = 5_000;

const RUTA_INGESTAS = '/api/crm/conocimiento/ingestas';
const LIMITE_LISTA = 20;

/** Fila del wire de GET/POST (la ruta nunca manda contenidoCrudo). */
export interface IngestaConocimientoVista {
  id: number;
  nombre: string;
  tipo: 'TEXTO' | 'PDF' | 'TXT' | 'DOCX';
  tamanoBytes: number;
  estado: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADA' | 'FALLIDA';
  error: string | null;
  entradasCreadas: number;
  creadoPor: string | null;
  creadoEn: string;
  procesadoEn: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
}

export type UseIngestasConocimientoStatus = 'idle' | 'loading' | 'populated' | 'error';

/** Vigencia opcional del formulario: ''/null/undefined = sin límite. */
export interface VigenciaIngestaUi {
  desde?: string | null;
  hasta?: string | null;
}

export interface UseIngestasConocimientoResult {
  ingestas: IngestaConocimientoVista[];
  status: UseIngestasConocimientoStatus;
  error: string | null;
  refetch: () => void;
  /** POST texto pegado → la ingesta creada, o null con errorSubida. */
  cargarTexto: (entrada: { nombre: string; contenido: string; vigencia?: VigenciaIngestaUi }) => Promise<IngestaConocimientoVista | null>;
  /** POST archivo → la ingesta creada, o null con errorSubida. */
  cargarArchivo: (entrada: { file: File; vigencia?: VigenciaIngestaUi }) => Promise<IngestaConocimientoVista | null>;
  /** true mientras un POST de carga está en vuelo (texto o archivo). */
  subiendo: boolean;
  errorSubida: string | null;
  limpiarErrorSubida: () => void;
}

const TIPOS = new Set(['TEXTO', 'PDF', 'TXT', 'DOCX']);
const ESTADOS = new Set(['PENDIENTE', 'PROCESANDO', 'COMPLETADA', 'FALLIDA']);

function esIngestaVista(v: unknown): v is IngestaConocimientoVista {
  if (typeof v !== 'object' || v === null) return false;
  const fila = v as Record<string, unknown>;
  return (
    typeof fila.id === 'number' &&
    typeof fila.nombre === 'string' &&
    typeof fila.tipo === 'string' &&
    TIPOS.has(fila.tipo) &&
    typeof fila.tamanoBytes === 'number' &&
    typeof fila.estado === 'string' &&
    ESTADOS.has(fila.estado) &&
    typeof fila.entradasCreadas === 'number' &&
    typeof fila.creadoEn === 'string'
  );
}

function esRespuestaLista(v: unknown): v is { success: true; ingestas: IngestaConocimientoVista[] } {
  if (typeof v !== 'object' || v === null) return false;
  const cuerpo = v as Record<string, unknown>;
  return cuerpo.success === true && Array.isArray(cuerpo.ingestas) && cuerpo.ingestas.every(esIngestaVista);
}

function esRespuestaCreacion(v: unknown): v is { success: true; ingesta: IngestaConocimientoVista } {
  if (typeof v !== 'object' || v === null) return false;
  const cuerpo = v as Record<string, unknown>;
  return cuerpo.success === true && esIngestaVista(cuerpo.ingesta);
}

function vigenciaNoVacia(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.trim() !== '';
}

export function useIngestasConocimiento(): UseIngestasConocimientoResult {
  const [ingestas, setIngestas] = useState<IngestaConocimientoVista[]>([]);
  const [status, setStatus] = useState<UseIngestasConocimientoStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Refresco silencioso (stale-while-error): un fallo conserva la
  // lista y NUNCA baja el status a error — solo la carga inicial lo
  // hace. La lista jamás se pisa con un body inválido.
  const refrescar = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${RUTA_INGESTAS}?limite=${LIMITE_LISTA}`);
      const json: unknown = await response.json().catch(() => null);
      if (!mountedRef.current) return;
      if (!response.ok || !esRespuestaLista(json)) return;
      setIngestas(json.ingestas);
      setStatus('populated');
    } catch {
      // Red caída / abort: conserva la lista en silencio.
    }
  }, []);

  // Carga inicial (una vez): acá sí el fallo es visible (status error).
  useEffect(() => {
    let vigente = true;
    // setState en el cuerpo del efecto es intencional acá: marca el
    // arranque de la carga inicial (useEmpresas/useHiloConversacion
    // precedent — el status idle→loading es el contrato del hook).
    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus('loading');
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      try {
        const response = await fetch(`${RUTA_INGESTAS}?limite=${LIMITE_LISTA}`);
        const json: unknown = await response.json().catch(() => null);
        if (!vigente) return;
        if (!response.ok || !esRespuestaLista(json)) {
          setStatus('error');
          setError(`No se pudieron cargar las ingestas (HTTP ${response.status})`);
          return;
        }
        setIngestas(json.ingestas);
        setStatus('populated');
      } catch {
        if (vigente) {
          setStatus('error');
          setError('No se pudieron cargar las ingestas (error de red)');
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const hayPendientes = useMemo(
    () => ingestas.some((i) => i.estado === 'PENDIENTE' || i.estado === 'PROCESANDO'),
    [ingestas],
  );

  // Estado en vivo: SOLO mientras hay trabajo de la cola a la vista.
  useEffect(() => {
    if (!hayPendientes) return;
    const intervalo = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refrescar();
    }, INTERVALO_POLLING_INGESTAS_MS);
    return () => clearInterval(intervalo);
  }, [hayPendientes, refrescar]);

  const refetch = useCallback((): void => {
    void refrescar();
  }, [refrescar]);

  const cargar = useCallback(
    async (cuerpo: BodyInit): Promise<IngestaConocimientoVista | null> => {
      setSubiendo(true);
      setErrorSubida(null);
      try {
        const response = await fetch(RUTA_INGESTAS, { method: 'POST', body: cuerpo });
        const json: unknown = await response.json().catch(() => null);
        if (!mountedRef.current) return null;
        if (!response.ok || !esRespuestaCreacion(json)) {
          const mensaje =
            typeof json === 'object' && json !== null && 'error' in json
              ? String((json as Record<string, unknown>).error)
              : `No se pudo cargar la ingesta (HTTP ${response.status})`;
          setErrorSubida(mensaje);
          return null;
        }
        // La lista se refresca para que la nueva fila aparezca ya
        // (y el polling arranque si nace PENDIENTE).
        await refrescar();
        return json.ingesta;
      } catch {
        if (mountedRef.current) setErrorSubida('No se pudo cargar la ingesta (error de red)');
        return null;
      } finally {
        if (mountedRef.current) setSubiendo(false);
      }
    },
    [refrescar],
  );

  const cargarTexto = useCallback(
    (entrada: { nombre: string; contenido: string; vigencia?: VigenciaIngestaUi }): Promise<IngestaConocimientoVista | null> => {
      const cuerpo: Record<string, string> = {
        nombre: entrada.nombre,
        contenido: entrada.contenido,
      };
      if (vigenciaNoVacia(entrada.vigencia?.desde)) cuerpo.vigenciaDesde = entrada.vigencia?.desde as string;
      if (vigenciaNoVacia(entrada.vigencia?.hasta)) cuerpo.vigenciaHasta = entrada.vigencia?.hasta as string;
      return cargar(JSON.stringify(cuerpo));
    },
    [cargar],
  );

  const cargarArchivo = useCallback(
    (entrada: { file: File; vigencia?: VigenciaIngestaUi }): Promise<IngestaConocimientoVista | null> => {
      const fd = new FormData();
      fd.append('file', entrada.file);
      if (vigenciaNoVacia(entrada.vigencia?.desde)) fd.append('vigenciaDesde', entrada.vigencia?.desde as string);
      if (vigenciaNoVacia(entrada.vigencia?.hasta)) fd.append('vigenciaHasta', entrada.vigencia?.hasta as string);
      return cargar(fd);
    },
    [cargar],
  );

  const limpiarErrorSubida = useCallback((): void => {
    setErrorSubida(null);
  }, []);

  return {
    ingestas,
    status,
    error,
    refetch,
    cargarTexto,
    cargarArchivo,
    subiendo,
    errorSubida,
    limpiarErrorSubida,
  };
}
