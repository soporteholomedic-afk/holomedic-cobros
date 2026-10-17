'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  aErrorGuardado,
  ejecutarProbe,
  ERROR_RED_GUARDAR,
  esFuentes,
  esRegistro,
  leerJson,
  type ErrorGuardadoConfig,
  type FuenteConfigUi,
  type ResultadoProbeVista,
  type UseConfigStatus,
} from './useConfigAgente';
import { esVistaSecreto, type VistaSecretoUi } from './useConfigCanal';

/**
 * useConfigMemoria() — client hook behind the "Memoria" tab of
 * /admin/crm/configuracion (agente-ia-crm E5·T6): Engram url, token,
 * timeout and retention. Same secret rule as useConfigCanal: the
 * token is only a `{configurado, mascara}` view and a plaintext sent
 * in a PUT is never retained in state, even on failure.
 */

const RUTA_MEMORIA = '/api/crm/configuracion/memoria';
const RUTA_PROBAR = '/api/crm/configuracion/memoria/probar';

const CAMPOS_MEMORIA = ['url', 'token', 'timeoutMs', 'retencionMeses'] as const;

export interface ConfigMemoriaVista {
  url: string | null;
  timeoutMs: number;
  retencionMeses: number;
  token: VistaSecretoUi;
}

export type FuentesMemoria = Record<(typeof CAMPOS_MEMORIA)[number], FuenteConfigUi>;

/** '' / omitted token keeps it, null deletes it (server contract). */
export interface CambiosConfigMemoriaUi {
  url?: string;
  timeoutMs?: number;
  retencionMeses?: number;
  token?: string | null;
}

function esConfigMemoria(valor: unknown): valor is ConfigMemoriaVista {
  return (
    esRegistro(valor) &&
    (valor.url === null || typeof valor.url === 'string') &&
    typeof valor.timeoutMs === 'number' &&
    typeof valor.retencionMeses === 'number' &&
    esVistaSecreto(valor.token)
  );
}

interface RespuestaMemoria {
  success: true;
  config: ConfigMemoriaVista;
  fuentes: FuentesMemoria;
}

function esRespuestaMemoria(valor: unknown): valor is RespuestaMemoria {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    esConfigMemoria(valor.config) &&
    esFuentes(valor.fuentes, CAMPOS_MEMORIA)
  );
}

export interface UseConfigMemoriaResult {
  config: ConfigMemoriaVista | null;
  fuentes: FuentesMemoria | null;
  status: UseConfigStatus;
  error: string | null;
  guardar: (cambios: CambiosConfigMemoriaUi) => Promise<boolean>;
  guardando: boolean;
  errorGuardado: ErrorGuardadoConfig | null;
  limpiarErrorGuardado: () => void;
  /** true once the server said CRM_CONFIG_KEY is missing: the token can't be edited. */
  claveNoConfigurada: boolean;
  probar: () => Promise<void>;
  probando: boolean;
  resultadoProbe: ResultadoProbeVista | null;
}

export function useConfigMemoria(): UseConfigMemoriaResult {
  const [config, setConfig] = useState<ConfigMemoriaVista | null>(null);
  const [fuentes, setFuentes] = useState<FuentesMemoria | null>(null);
  const [status, setStatus] = useState<UseConfigStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<ErrorGuardadoConfig | null>(null);
  const [claveNoConfigurada, setClaveNoConfigurada] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultadoProbe, setResultadoProbe] = useState<ResultadoProbeVista | null>(null);
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
        const response = await fetch(RUTA_MEMORIA);
        const json = await leerJson(response);
        if (!vigente) return;
        if (!response.ok || !esRespuestaMemoria(json)) {
          setStatus('error');
          setError(`No se pudo cargar la configuración de memoria (HTTP ${response.status})`);
          return;
        }
        setConfig(json.config);
        setFuentes(json.fuentes);
        setStatus('populated');
      } catch {
        if (vigente) {
          setStatus('error');
          setError('No se pudo cargar la configuración de memoria (error de red)');
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const guardar = useCallback(async (cambios: CambiosConfigMemoriaUi): Promise<boolean> => {
    setGuardando(true);
    setErrorGuardado(null);
    try {
      const response = await fetch(RUTA_MEMORIA, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const json = await leerJson(response);
      if (!mountedRef.current) return false;
      if (!response.ok || !esRespuestaMemoria(json)) {
        const fallo = aErrorGuardado(json, response.status);
        if (fallo.code === 'CLAVE_NO_CONFIGURADA') setClaveNoConfigurada(true);
        setErrorGuardado(fallo);
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

  const probar = useCallback(async (): Promise<void> => {
    setProbando(true);
    setResultadoProbe(null);
    const resultado = await ejecutarProbe(RUTA_PROBAR);
    if (!mountedRef.current) return;
    setResultadoProbe(resultado);
    setProbando(false);
  }, []);

  return {
    config,
    fuentes,
    status,
    error,
    guardar,
    guardando,
    errorGuardado,
    limpiarErrorGuardado,
    claveNoConfigurada,
    probar,
    probando,
    resultadoProbe,
  };
}
