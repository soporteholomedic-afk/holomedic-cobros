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

/**
 * useConfigCanal() — client hook behind the "Canal Kapso" tab of
 * /admin/crm/configuracion (agente-ia-crm E5·T6). Secrets only ever
 * exist here as `{configurado, mascara, ilegible}`: a plaintext typed
 * by the operator travels in the PUT body and is NEVER kept in state,
 * not even when the save fails. The only plaintext the hook may hold
 * is `webhookSecretGenerado` (shown once by the server) until the page
 * dismisses it; any other successful save also discards it.
 */

const RUTA_CANAL = '/api/crm/configuracion/canal';
const RUTA_PROBAR = '/api/crm/configuracion/canal/probar';

export const CAMPOS_CANAL = ['modo', 'apiKey', 'phoneNumberId', 'webhookSecret', 'timeoutMs'] as const;

export interface VistaSecretoUi {
  configurado: boolean;
  mascara: string;
  ilegible?: true;
}

export type ModoKapsoUi = 'real' | 'simulado';

export interface ConfigCanalVista {
  modo: ModoKapsoUi | null;
  phoneNumberId: string | null;
  timeoutMs: number;
  apiKey: VistaSecretoUi;
  webhookSecret: VistaSecretoUi;
}

export type FuentesCanal = Record<(typeof CAMPOS_CANAL)[number], FuenteConfigUi>;

/** '' / omitted secret keeps it, null deletes it (server contract). */
export interface CambiosConfigCanalUi {
  modo?: ModoKapsoUi;
  phoneNumberId?: string;
  timeoutMs?: number;
  apiKey?: string | null;
  webhookSecret?: string | null;
}

export function esVistaSecreto(valor: unknown): valor is VistaSecretoUi {
  return (
    esRegistro(valor) &&
    typeof valor.configurado === 'boolean' &&
    typeof valor.mascara === 'string' &&
    (valor.ilegible === undefined || valor.ilegible === true)
  );
}

function esConfigCanal(valor: unknown): valor is ConfigCanalVista {
  return (
    esRegistro(valor) &&
    (valor.modo === null || valor.modo === 'real' || valor.modo === 'simulado') &&
    (valor.phoneNumberId === null || typeof valor.phoneNumberId === 'string') &&
    typeof valor.timeoutMs === 'number' &&
    esVistaSecreto(valor.apiKey) &&
    esVistaSecreto(valor.webhookSecret)
  );
}

interface RespuestaCanal {
  success: true;
  config: ConfigCanalVista;
  fuentes: FuentesCanal;
  webhookSecretGenerado?: string;
}

function esRespuestaCanal(valor: unknown): valor is RespuestaCanal {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    esConfigCanal(valor.config) &&
    esFuentes(valor.fuentes, CAMPOS_CANAL) &&
    (valor.webhookSecretGenerado === undefined || typeof valor.webhookSecretGenerado === 'string')
  );
}

export interface UseConfigCanalResult {
  config: ConfigCanalVista | null;
  fuentes: FuentesCanal | null;
  status: UseConfigStatus;
  error: string | null;
  guardar: (cambios: CambiosConfigCanalUi) => Promise<boolean>;
  guardando: boolean;
  errorGuardado: ErrorGuardadoConfig | null;
  limpiarErrorGuardado: () => void;
  /** true once the server said CRM_CONFIG_KEY is missing: secrets can't be edited. */
  claveNoConfigurada: boolean;
  regenerarWebhookSecret: () => Promise<boolean>;
  /** Plaintext shown ONCE; null after `descartarWebhookSecret()`. */
  webhookSecretGenerado: string | null;
  descartarWebhookSecret: () => void;
  probar: () => Promise<void>;
  probando: boolean;
  resultadoProbe: ResultadoProbeVista | null;
}

export function useConfigCanal(): UseConfigCanalResult {
  const [config, setConfig] = useState<ConfigCanalVista | null>(null);
  const [fuentes, setFuentes] = useState<FuentesCanal | null>(null);
  const [status, setStatus] = useState<UseConfigStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<ErrorGuardadoConfig | null>(null);
  const [claveNoConfigurada, setClaveNoConfigurada] = useState(false);
  const [webhookSecretGenerado, setWebhookSecretGenerado] = useState<string | null>(null);
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
        const response = await fetch(RUTA_CANAL);
        const json = await leerJson(response);
        if (!vigente) return;
        if (!response.ok || !esRespuestaCanal(json)) {
          setStatus('error');
          setError(`No se pudo cargar la configuración del canal (HTTP ${response.status})`);
          return;
        }
        setConfig(json.config);
        setFuentes(json.fuentes);
        setStatus('populated');
      } catch {
        if (vigente) {
          setStatus('error');
          setError('No se pudo cargar la configuración del canal (error de red)');
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const enviar = useCallback(
    async (cuerpo: Record<string, unknown>): Promise<RespuestaCanal | null> => {
      setGuardando(true);
      setErrorGuardado(null);
      try {
        const response = await fetch(RUTA_CANAL, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
        const json = await leerJson(response);
        if (!mountedRef.current) return null;
        if (!response.ok || !esRespuestaCanal(json)) {
          const fallo = aErrorGuardado(json, response.status);
          if (fallo.code === 'CLAVE_NO_CONFIGURADA') setClaveNoConfigurada(true);
          setErrorGuardado(fallo);
          return null;
        }
        setConfig(json.config);
        setFuentes(json.fuentes);
        return json;
      } catch {
        if (mountedRef.current) setErrorGuardado(ERROR_RED_GUARDAR);
        return null;
      } finally {
        if (mountedRef.current) setGuardando(false);
      }
    },
    [],
  );

  const guardar = useCallback(
    async (cambios: CambiosConfigCanalUi): Promise<boolean> => {
      const respuesta = await enviar({ ...cambios });
      if (respuesta === null) return false;
      setWebhookSecretGenerado(null);
      return true;
    },
    [enviar],
  );

  const regenerarWebhookSecret = useCallback(async (): Promise<boolean> => {
    const respuesta = await enviar({ accion: 'regenerarWebhookSecret' });
    if (respuesta === null) return false;
    setWebhookSecretGenerado(respuesta.webhookSecretGenerado ?? null);
    return respuesta.webhookSecretGenerado !== undefined;
  }, [enviar]);

  const descartarWebhookSecret = useCallback((): void => {
    setWebhookSecretGenerado(null);
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
    regenerarWebhookSecret,
    webhookSecretGenerado,
    descartarWebhookSecret,
    probar,
    probando,
    resultadoProbe,
  };
}
