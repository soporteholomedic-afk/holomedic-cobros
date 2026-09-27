'use client';

import { ArrowRight } from 'lucide-react';

/**
 * FlowExplainer (task 8.2, mock parity) — the "Explicación Clara del
 * Flujo" banner: the two chips, the question heading, the 3 numbered
 * mock-verbatim paragraphs (strong marks kept) and the 4-step visual
 * sequence (Carta Inicial → 3 Semanas → Pausa 3 Meses → Reactivación).
 * Fully static: the flow it explains is the one the cadence engine
 * actually runs (carta + 3 seguimientos, decision 6; no simulation
 * buttons — decision 7).
 */

const PASOS = [
  { numero: '1', etiqueta: 'Carta Inicial', tono: 'text-emerald-400', circulo: 'bg-emerald-500/20 border-emerald-500/40' },
  { numero: '2', etiqueta: '3 Semanas', tono: 'text-amber-300', circulo: 'bg-amber-500/20 border-amber-500/40' },
  { numero: '3', etiqueta: 'Pausa 3 Meses', tono: 'text-purple-300', circulo: 'bg-purple-500/20 border-purple-500/40' },
  { numero: '4', etiqueta: 'Reactivación', tono: 'text-teal-300', circulo: 'bg-teal-500/20 border-teal-500/40' },
] as const;

export function FlowExplainer() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-slate-900 p-5 text-white shadow-md">
      <div
        className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-teal-500/10 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="max-w-2xl space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-teal-400/30 bg-teal-400/20 px-2.5 py-0.5 text-xs font-medium text-teal-300">
              Envío Automático y Sin Complicaciones
            </span>
            <span className="rounded-full border border-purple-400/30 bg-purple-400/20 px-2.5 py-0.5 text-xs font-medium text-purple-300">
              Regla de 3 Meses
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">
            ¿Cómo funciona el envío de correos y la reactivación?
          </h2>
          <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
            1. Al registrar a una empresa, se le envía de inmediato una{' '}
            <strong className="font-semibold text-white">Carta de Presentación</strong>.
            <br />
            2. Si no contesta, recibe un correo amable{' '}
            <strong className="font-semibold text-white">
              una vez por semana durante 3 semanas
            </strong>
            .
            <br />
            3. Si dice que no tiene interés o pasan las 3 semanas,{' '}
            <strong className="font-semibold text-white">se pone en pausa durante 3 meses</strong>{' '}
            para no saturarla. Cumplido ese tiempo, el sistema te avisa para volver a contactarla.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3 text-xs lg:w-auto lg:justify-start">
          {PASOS.map(({ numero, etiqueta, tono, circulo }, indice) => (
            <div key={etiqueta} className="contents">
              {indice > 0 && (
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              )}
              <div className={`flex items-center gap-1.5 ${tono}`}>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${circulo}`}
                >
                  {numero}
                </span>
                <span>{etiqueta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
