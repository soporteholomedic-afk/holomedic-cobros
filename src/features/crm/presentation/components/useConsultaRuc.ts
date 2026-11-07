'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DatosSunat } from '../../domain/entities';

/** One SUNAT lookup state for the alta form and the "Falta RUC" card (crm-consulta-sunat T5/T6, S3). */
export type EstadoConsultaRuc =
  | { tipo: 'idle' }
  | { tipo: 'cargando' }
  | { tipo: 'encontrada'; datos: DatosSunat }
  | { tipo: 'no-encontrada'; mensaje: string }
  | { tipo: 'no-configurada'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

export interface ConsultaRuc {
  estado: EstadoConsultaRuc;
  /** Back to idle (cancelling any lookup in flight) without refetching. */
  resetear: () => void;
}

const DEBOUNCE_MS = 500;
const RUC_RE = /^\d{11}$/;
const FALLBACK_CONEXION = 'No se pudo conectar con la consulta SUNAT.';
const IDLE: EstadoConsultaRuc = { tipo: 'idle' };
const CARGANDO: EstadoConsultaRuc = { tipo: 'cargando' };

interface RespuestaOk {
  success: true;
  datos: unknown;
}

interface RespuestaFalla {
  success: false;
  error?: unknown;
}

/** Narrow the route body `{ success, datos | error }` without trusting it blindly. */
function leerRespuesta(body: unknown): RespuestaOk | RespuestaFalla | null {
  if (typeof body !== 'object' || body === null || !('success' in body)) return null;
  return body as RespuestaOk | RespuestaFalla;
}

/** The response is only usable when razonSocial is text; the rest may be null. */
function esDatosSunat(v: unknown): v is DatosSunat {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.razonSocial === 'string' &&
    d.razonSocial.trim().length > 0 &&
    (d.direccion === null || typeof d.direccion === 'string') &&
    (d.estado === null || typeof d.estado === 'string') &&
    (d.condicion === null || typeof d.condicion === 'string')
  );
}

const CHIP_BASE = 'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold';
const CHIP_VERDE = `${CHIP_BASE} border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200`;
const CHIP_ROJO = `${CHIP_BASE} border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200`;
const CHIP_NEUTRO = `${CHIP_BASE} border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200`;
const POSITIVAS = ['ACTIVO', 'HABIDO'];
const NEGATIVAS = ['BAJA', 'SUSPENDIDO'];

/** "ACTIVO · HABIDO" chip: green when everything is positive, red when anything is BAJA/SUSPENDIDO, neutral otherwise. */
export function badgeSunat(datos: DatosSunat): { texto: string; clase: string } | null {
  const valores = [datos.estado, datos.condicion].filter((v): v is string => v !== null);
  if (valores.length === 0) return null;
  const texto = valores.join(' · ');
  const clase = valores.every((v) => POSITIVAS.includes(v))
    ? CHIP_VERDE
    : valores.some((v) => NEGATIVAS.includes(v))
      ? CHIP_ROJO
      : CHIP_NEUTRO;
  return { texto, clase };
}

interface RespuestaGuardada {
  ruc: string;
  resultado: EstadoConsultaRuc;
}

/**
 * Shared SUNAT lookup (crm-consulta-sunat T5/T6): a debounced
 * `GET /api/crm/ruc/{ruc}` whenever `ruc` is exactly 11 digits. States:
 * idle → cargando → encontrada / no-encontrada (404) / no-configurada
 * (503) / error (502, 400, red, unusable body). Every failure is
 * non-blocking: the caller keeps working and shows `mensaje` inline.
 * Editing the input or unmounting aborts the lookup in flight; `resetear`
 * goes back to idle and its late answer never lands.
 *
 * The effect only fetches and aborts; the visible state is derived during
 * render from the answer stored with the RUC it belongs to, so a stale
 * answer never leaks into a new input.
 */
export function useConsultaRuc(ruc: string): ConsultaRuc {
  const [respuesta, setRespuesta] = useState<RespuestaGuardada | null>(null);
  const [anuladoPara, setAnuladoPara] = useState<string | null>(null);
  const controlRef = useRef<AbortController | null>(null);

  const limpio = ruc.trim();

  const resetear = useCallback((): void => {
    controlRef.current?.abort();
    setRespuesta(null);
    setAnuladoPara(limpio);
  }, [limpio]);

  useEffect(() => {
    if (!RUC_RE.test(limpio)) {
      controlRef.current?.abort();
      return;
    }
    const control = new AbortController();
    controlRef.current = control;
    const temporizador = setTimeout(() => {
      setRespuesta({ ruc: limpio, resultado: CARGANDO });
      void (async (): Promise<void> => {
        try {
          const res = await fetch(`/api/crm/ruc/${limpio}`, { signal: control.signal });
          let body: unknown = null;
          try {
            body = await res.json();
          } catch {
            // not JSON — falls through to the error mapping below
          }
          if (control.signal.aborted) return;
          const r = leerRespuesta(body);
          if (res.ok && r !== null && r.success && esDatosSunat(r.datos)) {
            setRespuesta({ ruc: limpio, resultado: { tipo: 'encontrada', datos: r.datos } });
            return;
          }
          const mensaje =
            r !== null && !r.success && typeof r.error === 'string' && r.error
              ? r.error
              : `GET /api/crm/ruc → ${res.status}`;
          if (res.status === 404) setRespuesta({ ruc: limpio, resultado: { tipo: 'no-encontrada', mensaje } });
          else if (res.status === 503) setRespuesta({ ruc: limpio, resultado: { tipo: 'no-configurada', mensaje } });
          else setRespuesta({ ruc: limpio, resultado: { tipo: 'error', mensaje } });
        } catch {
          if (control.signal.aborted) return; // superseded or unmounted: never a UI error
          setRespuesta({ ruc: limpio, resultado: { tipo: 'error', mensaje: FALLBACK_CONEXION } });
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [limpio]);

  const estado = useMemo<EstadoConsultaRuc>(() => {
    if (respuesta && respuesta.ruc === limpio) return respuesta.resultado;
    if (anuladoPara === limpio || !RUC_RE.test(limpio)) return IDLE;
    return CARGANDO;
  }, [respuesta, anuladoPara, limpio]);

  return { estado, resetear };
}
