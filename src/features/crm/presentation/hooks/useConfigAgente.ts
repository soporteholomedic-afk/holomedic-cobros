'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useConfigAgente() — client hook behind the "Agente" tab and the
 * global kill-switch bar of /admin/crm/configuracion (agente-ia-crm
 * E5·T6). Fetch-only (useIngestasConocimiento model): the response
 * shape is guarded, no failure ever throws into the page, and every
 * successful save ADOPTS the server's answer (no refetch round trip,
 * no optimistic UI). The kill switch is server-truth: the state shown
 * is only ever what the endpoint answered; a failure keeps the
 * previous state and surfaces `errorKillSwitch`.
 *
 * This module also hosts the small wire helpers shared by the sibling
 * config hooks (canal / memoria / auditoría).
 */

export const RUTA_CONFIG_AGENTE = '/api/crm/configuracion/agente';
const RUTA_KILL_SWITCH = '/api/crm/configuracion/agente/kill-switch';

export type FuenteConfigUi = 'db' | 'env' | 'default';

export type CampoConfigAgenteUi =
  | 'habilitado'
  | 'umbralConfianza'
  | 'maxIntercambios'
  | 'horarioDesde'
  | 'horarioHasta'
  | 'textoEscalado';

export interface ConfigAgenteVista {
  habilitado: boolean;
  umbralConfianza: number;
  maxIntercambios: number;
  horarioDesde: number;
  horarioHasta: number;
  textoEscalado: string;
}

/** Editable subset (the kill switch has its own endpoint). */
export type CambiosConfigAgenteUi = Partial<Omit<ConfigAgenteVista, 'habilitado'>>;

export type UseConfigStatus = 'loading' | 'populated' | 'error';

/** A failed save: server message, offending field (400) and error code. */
export interface ErrorGuardadoConfig {
  mensaje: string;
  campo: string | null;
  code: string | null;
}

export interface ResultadoProbeVista {
  ok: boolean;
  detalle: string;
}

// ---------------------------------------------------------------------------
// Shared wire helpers
// ---------------------------------------------------------------------------

export function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export async function leerJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function esFuente(valor: unknown): valor is FuenteConfigUi {
  return valor === 'db' || valor === 'env' || valor === 'default';
}

export function esFuentes<K extends string>(valor: unknown, claves: readonly K[]): valor is Record<K, FuenteConfigUi> {
  return esRegistro(valor) && claves.every((clave) => esFuente(valor[clave]));
}

/** Maps a failed save response onto the typed error (never echoes the request). */
export function aErrorGuardado(json: unknown, status: number): ErrorGuardadoConfig {
  if (esRegistro(json) && typeof json.error === 'string') {
    return {
      mensaje: json.error,
      campo: typeof json.campo === 'string' ? json.campo : null,
      code: typeof json.code === 'string' ? json.code : null,
    };
  }
  return { mensaje: `No se pudo guardar (HTTP ${status})`, campo: null, code: null };
}

export const ERROR_RED_GUARDAR: ErrorGuardadoConfig = {
  mensaje: 'No se pudo guardar (error de red)',
  campo: null,
  code: null,
};

export function esResultadoProbe(valor: unknown): valor is { success: true; ok: boolean; detalle: string } {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    typeof valor.ok === 'boolean' &&
    typeof valor.detalle === 'string'
  );
}

/** POST a connection probe; failures become `{ok:false}` instead of throwing. */
export async function ejecutarProbe(ruta: string): Promise<ResultadoProbeVista> {
  try {
    const response = await fetch(ruta, { method: 'POST' });
    const json = await leerJson(response);
    if (!response.ok || !esResultadoProbe(json)) {
      return { ok: false, detalle: `No se pudo probar la conexión (HTTP ${response.status})` };
    }
    return { ok: json.ok, detalle: json.detalle };
  } catch {
    return { ok: false, detalle: 'No se pudo probar la conexión (error de red)' };
  }
}

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------

const CAMPOS_AGENTE: readonly CampoConfigAgenteUi[] = [
  'habilitado',
  'umbralConfianza',
  'maxIntercambios',
  'horarioDesde',
  'horarioHasta',
  'textoEscalado',
];

function esConfigAgente(valor: unknown): valor is ConfigAgenteVista {
  return (
    esRegistro(valor) &&
    typeof valor.habilitado === 'boolean' &&
    typeof valor.umbralConfianza === 'number' &&
    typeof valor.maxIntercambios === 'number' &&
    typeof valor.horarioDesde === 'number' &&
    typeof valor.horarioHasta === 'number' &&
    typeof valor.textoEscalado === 'string'
  );
}

interface RespuestaAgente {
  success: true;
  config: ConfigAgenteVista;
  fuentes: Record<CampoConfigAgenteUi, FuenteConfigUi>;
}

function esRespuestaAgente(valor: unknown): valor is RespuestaAgente {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    esConfigAgente(valor.config) &&
    esFuentes(valor.fuentes, CAMPOS_AGENTE)
  );
}

function esRespuestaKillSwitch(valor: unknown): valor is { success: true; habilitado: boolean } {
  return esRegistro(valor) && valor.success === true && typeof valor.habilitado === 'boolean';
}

export interface UseConfigAgenteResult {
  config: ConfigAgenteVista | null;
  fuentes: Record<CampoConfigAgenteUi, FuenteConfigUi> | null;
  status: UseConfigStatus;
  error: string | null;
  refetch: () => void;
  guardar: (cambios: CambiosConfigAgenteUi) => Promise<boolean>;
  guardando: boolean;
  errorGuardado: ErrorGuardadoConfig | null;
  limpiarErrorGuardado: () => void;
  alternarKillSwitch: (habilitado: boolean) => Promise<boolean>;
  cambiandoKillSwitch: boolean;
  errorKillSwitch: string | null;
}

export function useConfigAgente(): UseConfigAgenteResult {
  const [config, setConfig] = useState<ConfigAgenteVista | null>(null);
  const [fuentes, setFuentes] = useState<Record<CampoConfigAgenteUi, FuenteConfigUi> | null>(null);
  const [status, setStatus] = useState<UseConfigStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<ErrorGuardadoConfig | null>(null);
  const [cambiandoKillSwitch, setCambiandoKillSwitch] = useState(false);
  const [errorKillSwitch, setErrorKillSwitch] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const response = await fetch(RUTA_CONFIG_AGENTE);
        const json = await leerJson(response);
        if (!vigente) return;
        if (!response.ok || !esRespuestaAgente(json)) {
          setStatus('error');
          setError(`No se pudo cargar la configuración del agente (HTTP ${response.status})`);
          return;
        }
        setConfig(json.config);
        setFuentes(json.fuentes);
        setError(null);
        setStatus('populated');
      } catch {
        if (vigente) {
          setStatus('error');
          setError('No se pudo cargar la configuración del agente (error de red)');
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, [version]);

  const refetch = useCallback((): void => {
    setVersion((v) => v + 1);
  }, []);

  const guardar = useCallback(async (cambios: CambiosConfigAgenteUi): Promise<boolean> => {
    setGuardando(true);
    setErrorGuardado(null);
    try {
      const response = await fetch(RUTA_CONFIG_AGENTE, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const json = await leerJson(response);
      if (!mountedRef.current) return false;
      if (!response.ok || !esRespuestaAgente(json)) {
        setErrorGuardado(aErrorGuardado(json, response.status));
        return false;
      }
      setConfig(json.config);
      setFuentes(json.fuentes);
      return true;
    } catch {
      if (mountedRef.current) setErrorGuardado(ERROR_RED_GUARDAR);
      return false;
    } finally {
      if (mountedRef.current) setGuardando(false);
    }
  }, []);

  const limpiarErrorGuardado = useCallback((): void => {
    setErrorGuardado(null);
  }, []);

  const alternarKillSwitch = useCallback(async (habilitado: boolean): Promise<boolean> => {
    setCambiandoKillSwitch(true);
    setErrorKillSwitch(null);
    try {
      const response = await fetch(RUTA_KILL_SWITCH, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ habilitado }),
      });
      const json = await leerJson(response);
      if (!mountedRef.current) return false;
      if (!response.ok || !esRespuestaKillSwitch(json)) {
        setErrorKillSwitch(
          esRegistro(json) && typeof json.error === 'string'
            ? json.error
            : `No se pudo cambiar el estado del agente (HTTP ${response.status})`,
        );
        return false;
      }
      const respondido = json.habilitado;
      setConfig((previa) => (previa ? { ...previa, habilitado: respondido } : previa));
      return true;
    } catch {
      if (mountedRef.current) setErrorKillSwitch('No se pudo cambiar el estado del agente (error de red)');
      return false;
    } finally {
      if (mountedRef.current) setCambiandoKillSwitch(false);
    }
  }, []);

  return {
    config,
    fuentes,
    status,
    error,
    refetch,
    guardar,
    guardando,
    errorGuardado,
    limpiarErrorGuardado,
    alternarKillSwitch,
    cambiandoKillSwitch,
    errorKillSwitch,
  };
}
