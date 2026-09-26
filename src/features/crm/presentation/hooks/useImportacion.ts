'use client';

import { useCallback, useRef, useState } from 'react';

import type { FilaImportCrm } from '../../domain/importar/columnas';
import type { ErrorFilaImport } from '../../domain/importar/validarImportacion';
import type { ResultadoEjecucionImportacion } from '../../application/importar/ejecutarImportacion';

/**
 * useImportacion — client state machine for the Excel import wizard
 * (tasks pr8/WU3, spec G2 preview-before-commit).
 *
 *   idle ──validarFilas──▶ validando ──200──▶ vista-previa
 *     ▲                        │                 │
 *     cancelar ◀── error ◀─────┘                 ├─confirmar─▶ confirmando ──200──▶ resultado
 *     ▲                                          │             │
 *     └────────────── cancelar ◀─────────────────┘        error ◘ (preview kept)
 *
 * - `validarFilas` POSTs the raw parsed rows to /api/crm/import/validar
 *   and stores the preview. The SERVER re-validates everything — this
 *   hook never judges rows locally.
 * - `confirmar` re-posts the SAME rows to /api/crm/import/confirmar;
 *   it is a no-op until a successful validation stored them (and after
 *   `cancelar` discards them — G2: cancelling writes nothing).
 * - `reintentar` repeats the last failed step with the stored payload
 *   (useEmpresas retry pattern).
 * - `resultado` exposes the execution report (counters, errores,
 *   fallos, advertencias, job id).
 */

export interface EmpresaPreviewImport {
  ruc: string;
  razonSocial: string;
  tipo: string;
  /** Contacto names in first-seen order. */
  contactos: string[];
}

export interface VistaPreviaImport {
  totalFilas: number;
  filasValidas: number;
  empresas: EmpresaPreviewImport[];
  errores: ErrorFilaImport[];
}

export type UseImportacionStatus =
  | 'idle'
  | 'validando'
  | 'vista-previa'
  | 'confirmando'
  | 'resultado'
  | 'error';

export interface UseImportacionResult {
  status: UseImportacionStatus;
  vistaPrevia: VistaPreviaImport | null;
  resultado: ResultadoEjecucionImportacion | null;
  error: string | null;
  validarFilas(filas: readonly FilaImportCrm[], archivoNombre: string): Promise<void>;
  confirmar(): Promise<void>;
  cancelar(): void;
  reintentar(): Promise<void>;
}

// ---- Response shape guards (strict — no `any`) ----

function isEmpresaPreview(v: unknown): v is EmpresaPreviewImport {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.razonSocial === 'string' &&
    typeof obj.tipo === 'string' &&
    Array.isArray(obj.contactos) &&
    obj.contactos.every((c) => typeof c === 'string')
  );
}

function isVistaPrevia(v: unknown): v is VistaPreviaImport {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    obj.success === true &&
    typeof obj.totalFilas === 'number' &&
    typeof obj.filasValidas === 'number' &&
    Array.isArray(obj.empresas) &&
    obj.empresas.every(isEmpresaPreview) &&
    Array.isArray(obj.errores)
  );
}

function isResultado(v: unknown): v is { success: true; resultado: ResultadoEjecucionImportacion } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.success === true && typeof obj.resultado === 'object' && obj.resultado !== null;
}

function mensajeDeError(json: unknown, status: number): string {
  const apiError = (json as { error?: unknown }).error;
  return typeof apiError === 'string' ? apiError : `HTTP ${status}`;
}

async function llamar<T>(
  url: string,
  cuerpo: Record<string, unknown>,
  esOk: (json: unknown) => json is T,
): Promise<{ ok: true; datos: T } | { ok: false; error: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: mensajeDeError(json, response.status) };
  if (!esOk(json)) return { ok: false, error: 'Respuesta inesperada del servidor' };
  return { ok: true, datos: json };
}

export function useImportacion(): UseImportacionResult {
  const [status, setStatus] = useState<UseImportacionStatus>('idle');
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaImport | null>(null);
  const [resultado, setResultado] = useState<ResultadoEjecucionImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The rows/nombre survive across steps so confirmar re-posts the
  // SAME payload it previewed; refs avoid rerenders.
  const filasRef = useRef<readonly FilaImportCrm[] | null>(null);
  const nombreRef = useRef<string>('');
  const ultimaAccionRef = useRef<'validar' | 'confirmar' | null>(null);

  const ejecutarValidacion = useCallback(
    async (filas: readonly FilaImportCrm[], archivoNombre: string): Promise<void> => {
      filasRef.current = filas;
      nombreRef.current = archivoNombre;
      ultimaAccionRef.current = 'validar';
      setStatus('validando');
      setError(null);
      setVistaPrevia(null);
      setResultado(null);

      try {
        const respuesta = await llamar(
          '/api/crm/import/validar',
          { archivoNombre, filas },
          isVistaPrevia,
        );
        if (!respuesta.ok) {
          setError(respuesta.error);
          setStatus('error');
          return;
        }
        setVistaPrevia({
          // Explicit whitelist — the `success` envelope key never leaks
          // into the exposed value (matches VistaPreviaImport exactly).
          totalFilas: respuesta.datos.totalFilas,
          filasValidas: respuesta.datos.filasValidas,
          empresas: respuesta.datos.empresas,
          errores: respuesta.datos.errores,
        });
        setStatus('vista-previa');
      } catch {
        setError('Error de red');
        setStatus('error');
      }
    },
    [],
  );

  const confirmar = useCallback(async (): Promise<void> => {
    // Guard: nothing validated (or cancelled) → nothing to commit.
    const filas = filasRef.current;
    if (!filas) return;

    ultimaAccionRef.current = 'confirmar';
    setStatus('confirmando');
    setError(null);

    try {
      const respuesta = await llamar(
        '/api/crm/import/confirmar',
        { archivoNombre: nombreRef.current, filas },
        isResultado,
      );
      if (!respuesta.ok) {
        // The preview is KEPT on failure: the wizard stays on the
        // preview step where retrying or cancelling both make sense.
        setError(respuesta.error);
        setStatus('error');
        return;
      }
      setResultado(respuesta.datos.resultado);
      setStatus('resultado');
    } catch {
      setError('Error de red');
      setStatus('error');
    }
  }, []);

  const cancelar = useCallback((): void => {
    // G2: discard rows + preview — nothing was written and nothing
    // CAN be written afterwards (confirmar becomes a no-op).
    filasRef.current = null;
    ultimaAccionRef.current = null;
    setVistaPrevia(null);
    setResultado(null);
    setError(null);
    setStatus('idle');
  }, []);

  const reintentar = useCallback(async (): Promise<void> => {
    const filas = filasRef.current;
    if (!filas) return;
    if (ultimaAccionRef.current === 'validar') {
      await ejecutarValidacion(filas, nombreRef.current);
      return;
    }
    if (ultimaAccionRef.current === 'confirmar') await confirmar();
  }, [confirmar, ejecutarValidacion]);

  return { status, vistaPrevia, resultado, error, validarFilas: ejecutarValidacion, confirmar, cancelar, reintentar };
}
