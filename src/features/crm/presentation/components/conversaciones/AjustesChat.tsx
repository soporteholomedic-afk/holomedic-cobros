'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';

import type { AjustesConversacionVista } from './guards';
import { ETIQUETA_ESTADO_CONVERSACION } from './guards';

/**
 * AjustesChat (agente-ia-crm E3·T5) — the right column's settings
 * section (mockup .cfgchips): read-only chips carrying the PUBLIC
 * agent config ('umbral .60', 'intercambios límite 6', 'horario
 * 8–18', 'memoria: chat + empresa' — the two-level scoping model) plus
 * the MODO/estado/asignadaA display. The ONE interactive control is
 * the 'memoria activa' switch (privacy opt-out): optimistic flip,
 * revert on failure (the hook refreshes ajustes on success).
 */

export interface AjustesChatProps {
  ajustes: AjustesConversacionVista | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  alternando: boolean;
  errorToggle: string | null;
  /** true → ajustes refreshed by the server; false → revert the flip. */
  onToggleMemoriaActiva: (activa: boolean) => Promise<boolean>;
}

/** 0.6 → '.60' (mockup chip style, sin cero inicial). */
function formatearUmbral(valor: number): string {
  return valor.toFixed(2).replace(/^0\./, '.');
}

function textoModo(ajustes: AjustesConversacionVista): string {
  if (ajustes.estado === 'REQUIERE_HUMANO') return 'MODO: pidiendo ayuda';
  return ajustes.modo === 'IA' ? 'MODO: la Guía' : 'MODO: humano';
}

const CLASE_CHIP =
  'inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300';

export function AjustesChat({
  ajustes,
  status,
  error,
  alternando,
  errorToggle,
  onToggleMemoriaActiva,
}: AjustesChatProps) {
  // Flip optimista: null → el valor del servidor manda.
  const [optimista, setOptimista] = useState<boolean | null>(null);
  const memoriaEfectiva = optimista ?? ajustes?.memoriaActiva ?? true;

  async function manejarToggle(): Promise<void> {
    if (alternando) return;
    const nueva = !memoriaEfectiva;
    setOptimista(nueva);
    await onToggleMemoriaActiva(nueva);
    // Éxito → el servidor ya refrescó ajustes (el override sobra);
    // fallo → vuelve al valor del servidor (revert del flip).
    setOptimista(null);
  }

  return (
    <section
      aria-label="Agente en esta conversación"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        🤖 Agente en esta conversación
      </h3>

      {status === 'loading' && (
        <div role="status" className="mt-3 space-y-2" aria-label="Cargando ajustes">
          <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error ?? 'Error al cargar los ajustes'}
        </p>
      )}

      {status === 'ready' && ajustes !== null && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`${CLASE_CHIP} border-indigo-200 dark:border-indigo-900/60 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300`}>
              {textoModo(ajustes)}
            </span>
            <span className={CLASE_CHIP}>umbral {formatearUmbral(ajustes.config.umbralConfianza)}</span>
            <span className={CLASE_CHIP}>intercambios límite {ajustes.config.maxIntercambios}</span>
            <span className={CLASE_CHIP}>
              horario {ajustes.config.horarioDesde}–{ajustes.config.horarioHasta}
            </span>
            <span className={CLASE_CHIP}>memoria: chat + empresa</span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {ETIQUETA_ESTADO_CONVERSACION[ajustes.estado]}
          </p>
          {ajustes.asignadaA !== null && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Asignada a {ajustes.asignadaA}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/30 px-2.5 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Bot className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
              memoria activa
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={memoriaEfectiva}
              aria-label="memoria activa"
              disabled={alternando}
              onClick={() => void manejarToggle()}
              className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
                memoriaEfectiva
                  ? 'bg-teal-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span
                aria-hidden="true"
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                style={{ left: memoriaEfectiva ? '1.125rem' : '0.125rem' }}
              />
            </button>
          </div>

          {errorToggle !== null && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {errorToggle}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
