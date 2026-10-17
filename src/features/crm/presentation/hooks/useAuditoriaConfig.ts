'use client';

import { useCallback, useEffect, useState } from 'react';

import { esRegistro, leerJson } from './useConfigAgente';

/**
 * useAuditoriaConfig(prefijo) — the last 20 config audit rows for a
 * key prefix (agente-ia-crm E5·T6 change-history panel), plus
 * useResumenConocimiento() — the read-only counts behind the
 * "Conocimiento" tab. Both are fetch-only: response shapes are
 * guarded, failures land in `status: 'error'` (never thrown) and the
 * data is derived per request key so switching prefix shows `loading`
 * instead of the previous tab's rows. Audit rows of secrets arrive
 * without values (`esSecreto: true`).
 */

const LIMITE_AUDITORIA = 20;
const RUTA_AUDITORIA = '/api/crm/configuracion/auditoria';
const RUTA_CONOCIMIENTO = '/api/crm/configuracion/conocimiento';

export interface FilaAuditoriaConfig {
  id: number;
  clave: string;
  usuario: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  esSecreto: boolean;
  creadoEn: string;
}

export type UseConsultaStatus = 'loading' | 'populated' | 'error';

function esNullableString(valor: unknown): valor is string | null {
  return valor === null || typeof valor === 'string';
}

function esFilaAuditoria(valor: unknown): valor is FilaAuditoriaConfig {
  return (
    esRegistro(valor) &&
    typeof valor.id === 'number' &&
    typeof valor.clave === 'string' &&
    typeof valor.usuario === 'string' &&
    esNullableString(valor.valorAnterior) &&
    esNullableString(valor.valorNuevo) &&
    typeof valor.esSecreto === 'boolean' &&
    typeof valor.creadoEn === 'string'
  );
}

function esRespuestaAuditoria(valor: unknown): valor is { success: true; auditoria: FilaAuditoriaConfig[] } {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    Array.isArray(valor.auditoria) &&
    valor.auditoria.every(esFilaAuditoria)
  );
}

interface ResultadoAuditoria {
  clave: string;
  filas: FilaAuditoriaConfig[];
  error: string | null;
}

export interface UseAuditoriaConfigResult {
  filas: FilaAuditoriaConfig[];
  status: UseConsultaStatus;
  error: string | null;
  recargar: () => void;
}

export function useAuditoriaConfig(prefijo: string): UseAuditoriaConfigResult {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState<ResultadoAuditoria | null>(null);
  const clave = `${prefijo}|${version}`;

  useEffect(() => {
    let vigente = true;
    const claveConsulta = `${prefijo}|${version}`;
    (async () => {
      try {
        const response = await fetch(
          `${RUTA_AUDITORIA}?prefijo=${encodeURIComponent(prefijo)}&limite=${LIMITE_AUDITORIA}`,
        );
        const json = await leerJson(response);
        if (!vigente) return;
        if (!response.ok || !esRespuestaAuditoria(json)) {
          setResultado({
            clave: claveConsulta,
            filas: [],
            error: `No se pudo cargar el historial (HTTP ${response.status})`,
          });
          return;
        }
        setResultado({ clave: claveConsulta, filas: json.auditoria, error: null });
      } catch {
        if (vigente) {
          setResultado({ clave: claveConsulta, filas: [], error: 'No se pudo cargar el historial (error de red)' });
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, [prefijo, version]);

  const recargar = useCallback((): void => {
    setVersion((v) => v + 1);
  }, []);

  const vigente = resultado !== null && resultado.clave === clave;
  const status: UseConsultaStatus = !vigente ? 'loading' : resultado.error !== null ? 'error' : 'populated';
  return {
    filas: vigente ? resultado.filas : [],
    status,
    error: vigente ? resultado.error : null,
    recargar,
  };
}

// ---------------------------------------------------------------------------
// Resumen de conocimiento
// ---------------------------------------------------------------------------

export interface ResumenConocimiento {
  total: number;
  porOrigen: { MANUAL: number; SEMILLA: number; SUBIDO: number };
  ingestasPorEstado: { PENDIENTE: number; PROCESANDO: number; COMPLETADA: number; FALLIDA: number };
}

function sonConteos(valor: unknown, claves: readonly string[]): boolean {
  return esRegistro(valor) && claves.every((clave) => typeof valor[clave] === 'number');
}

function esRespuestaResumen(valor: unknown): valor is ResumenConocimiento & { success: true } {
  return (
    esRegistro(valor) &&
    valor.success === true &&
    typeof valor.total === 'number' &&
    sonConteos(valor.porOrigen, ['MANUAL', 'SEMILLA', 'SUBIDO']) &&
    sonConteos(valor.ingestasPorEstado, ['PENDIENTE', 'PROCESANDO', 'COMPLETADA', 'FALLIDA'])
  );
}

export interface UseResumenConocimientoResult {
  resumen: ResumenConocimiento | null;
  status: UseConsultaStatus;
  error: string | null;
}

export function useResumenConocimiento(): UseResumenConocimientoResult {
  const [estado, setEstado] = useState<UseResumenConocimientoResult>({
    resumen: null,
    status: 'loading',
    error: null,
  });

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const response = await fetch(RUTA_CONOCIMIENTO);
        const json = await leerJson(response);
        if (!vigente) return;
        if (!response.ok || !esRespuestaResumen(json)) {
          setEstado({
            resumen: null,
            status: 'error',
            error: `No se pudo cargar el resumen de conocimiento (HTTP ${response.status})`,
          });
          return;
        }
        setEstado({
          resumen: { total: json.total, porOrigen: json.porOrigen, ingestasPorEstado: json.ingestasPorEstado },
          status: 'populated',
          error: null,
        });
      } catch {
        if (vigente) {
          setEstado({
            resumen: null,
            status: 'error',
            error: 'No se pudo cargar el resumen de conocimiento (error de red)',
          });
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  return estado;
}
