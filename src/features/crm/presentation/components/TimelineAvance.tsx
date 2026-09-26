'use client';

import { useState } from 'react';

import type { Origen, PipelineEmpresa } from '../../domain/entities';
import { ENVIOS_POR_CICLO } from '../../domain/cadence';
import type { EventoPipeline } from '../../domain/maquinaEstados';
import type { HandoffHistorial, TransicionHistorial } from '../../domain/ports';
import {
  ETIQUETA_ETAPA,
  ETIQUETA_EVENTO,
  ETIQUETA_FLUJO,
  ETIQUETA_ORIGEN,
  etiquetaEvento,
  formatearFecha,
} from '../etiquetas';

/**
 * TimelineAvance — the LIVING timeline that fuses the former pipeline
 * state card and the history sections into ONE story (crm-ux redesign,
 * product decision): what happened → where you are → what you can do
 * next. Reading top to bottom tells the empresa's commercial journey.
 *
 * - Birth node is synthesized from the empresa registration (there is
 *   no T1/T6 audit row — the pipeline row is born inside the creation
 *   transaction).
 * - Historical nodes merge transiciones + handoffs, oldest first (the
 *   API returns newest-first; the story reads chronologically). Long
 *   histories collapse to the last few with an expand control.
 * - The "estás acá" node shows the LIVE pipeline state (etapa + ciclo
 *   + the envíos meter) — it can move without a transition row (a
 *   logged cadence send bumps counters silently).
 * - The next node carries the machine-legal actions: registering one
 *   re-renders the story with the new node (the caller owns the
 *   mutation flows — direct POSTs and the Rechazo/Handoff modals).
 */

const EVENTOS_COLAPSADOS = 5;

export interface TimelineAvanceProps {
  pipeline: PipelineEmpresa | null;
  transiciones: TransicionHistorial[];
  handoffs: HandoffHistorial[];
  empresaCreatedAt: string;
  empresaOrigen: Origen | null;
  disponibles: EventoPipeline[];
  enCurso: boolean;
  onAccion: (evento: EventoPipeline) => void;
  errorTransicion: string | null;
}

type NodoHistorico =
  | { tipo: 'transicion'; fecha: string; dato: TransicionHistorial }
  | { tipo: 'handoff'; fecha: string; dato: HandoffHistorial };

function NodoHistoricoFila({ nodo }: { nodo: NodoHistorico }) {
  if (nodo.tipo === 'handoff') {
    const h = nodo.dato;
    return (
      <>
        <span className="font-medium text-slate-800">Handoff a {h.area}</span>
        <span className="ml-auto shrink-0 pl-4 text-xs text-slate-500">
          {formatearFecha(h.createdAt)} · {h.usuario}
        </span>
        {h.nota !== null && (
          <p className="col-span-full mt-1 text-xs text-slate-500">Nota: {h.nota}</p>
        )}
      </>
    );
  }
  const t = nodo.dato;
  return (
    <>
      <span className="font-medium text-slate-800">{etiquetaEvento(t.evento)}</span>
      <span className="ml-auto shrink-0 pl-4 text-xs text-slate-500">
        {formatearFecha(t.createdAt)} · {t.usuario}
      </span>
      <p className="col-span-full mt-1 text-xs text-slate-500">
        {t.etapaPrevia === null ? 'Creación → ' : `${ETIQUETA_ETAPA[t.etapaPrevia]} → `}
        {ETIQUETA_ETAPA[t.etapaNueva]}
      </p>
      {t.motivo !== null && (
        <p className="col-span-full text-xs text-slate-500">Motivo: {t.motivo}</p>
      )}
    </>
  );
}

export function TimelineAvance({
  pipeline,
  transiciones,
  handoffs,
  empresaCreatedAt,
  empresaOrigen,
  disponibles,
  enCurso,
  onAccion,
  errorTransicion,
}: TimelineAvanceProps) {
  const [expandido, setExpandido] = useState(false);

  const historicos: NodoHistorico[] = [
    ...transiciones.map((t): NodoHistorico => ({ tipo: 'transicion', fecha: t.createdAt, dato: t })),
    ...handoffs.map((h): NodoHistorico => ({ tipo: 'handoff', fecha: h.createdAt, dato: h })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const visibles = expandido ? historicos : historicos.slice(-EVENTOS_COLAPSADOS);
  const ocultos = historicos.length - visibles.length;

  return (
    <section
      aria-label="Avance comercial"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Avance comercial
        </h2>
        {pipeline !== null && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
            {ETIQUETA_FLUJO[pipeline.flujo]}
          </span>
        )}
      </div>

      {pipeline === null ? (
        <p className="text-sm text-slate-500">Esta empresa todavía no registra avance comercial.</p>
      ) : (
        <ol className="relative space-y-6 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-slate-200">
          {/* Nacimiento — synthesized from the registration (no T1/T6 audit row). */}
          <li className="relative grid grid-cols-[1fr_auto] items-baseline gap-x-3 pl-8">
            <span
              className="absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-white bg-slate-400 shadow"
              aria-hidden="true"
            />
            <span className="font-medium text-slate-800">Empresa en el CRM</span>
            <span className="text-xs text-slate-500">{formatearFecha(empresaCreatedAt)}</span>
            <p className="col-span-full mt-1 text-xs text-slate-500">
              Origen: {empresaOrigen !== null ? ETIQUETA_ORIGEN[empresaOrigen] : 'Sin clasificar'}
            </p>
          </li>

          {historicos.length > EVENTOS_COLAPSADOS && (
            <li className="relative pl-8">
              <button
                type="button"
                onClick={() => setExpandido(expandido ? false : true)}
                className="text-xs font-medium text-sky-600 hover:text-sky-700"
              >
                {expandido
                  ? 'Ocultar eventos anteriores'
                  : `Ver ${ocultos} ${ocultos === 1 ? 'evento' : 'eventos'} anteriores`}
              </button>
            </li>
          )}

          {visibles.map((nodo) => (
            <li
              key={nodo.tipo === 'transicion' ? `t-${nodo.dato.id}` : `h-${nodo.dato.id}`}
              className="relative grid grid-cols-[1fr_auto] items-baseline gap-x-3 pl-8"
            >
              <span
                className={`absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-white shadow ${
                  nodo.tipo === 'handoff' ? 'bg-indigo-400' : 'bg-sky-400'
                }`}
                aria-hidden="true"
              />
              <NodoHistoricoFila nodo={nodo} />
            </li>
          ))}

          {/* Estado actual — la posición viva del pipeline. */}
          <li className="relative grid grid-cols-[1fr_auto] items-baseline gap-x-3 pl-8">
            <span
              className="absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-sky-500 bg-white shadow"
              aria-hidden="true"
            >
              <span className="block h-full w-full rounded-full bg-sky-500 opacity-40" />
            </span>
            <span className="font-semibold text-slate-800">
              Estás acá: {ETIQUETA_ETAPA[pipeline.etapa]}
            </span>
            <span className="text-xs text-slate-500">Ciclo {pipeline.ciclo}</span>
            <div className="col-span-full mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className="flex items-center gap-1"
                aria-label={`Envíos del ciclo: ${pipeline.enviosCiclo} de ${ENVIOS_POR_CICLO}`}
                title={`Envíos del ciclo: ${pipeline.enviosCiclo} de ${ENVIOS_POR_CICLO}`}
              >
                {Array.from({ length: ENVIOS_POR_CICLO }, (_, indice) => (
                  <span
                    key={indice}
                    className={`h-2 w-2 rounded-full ${
                      indice < pipeline.enviosCiclo ? 'bg-sky-500' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </span>
              <span>
                {pipeline.enviosCiclo} de {ENVIOS_POR_CICLO} envíos del ciclo
              </span>
            </div>
            {pipeline.etapa === 'RECHAZADO' && pipeline.motivoRechazo !== null && (
              <p className="col-span-full mt-1 text-xs text-slate-500">
                Motivo: {pipeline.motivoRechazo}
                {pipeline.rechazadoHasta !== null &&
                  ` · Reactivable desde ${formatearFecha(pipeline.rechazadoHasta)}`}
              </p>
            )}
            {pipeline.etapa === 'DESCANSO' && pipeline.descansoHasta !== null && (
              <p className="col-span-full mt-1 text-xs text-slate-500">
                En descanso hasta {formatearFecha(pipeline.descansoHasta)}
              </p>
            )}
          </li>

          {/* Próximo paso — las acciones viven en el nodo que sigue. */}
          <li className="relative pl-8">
            <span
              className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-slate-400 bg-white"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-700">¿Qué sigue?</p>
            {disponibles.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {disponibles.map((evento) => (
                  <button
                    key={evento}
                    type="button"
                    disabled={enCurso}
                    onClick={() => onAccion(evento)}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {ETIQUETA_EVENTO[evento]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Sin acciones disponibles por ahora.</p>
            )}
            {errorTransicion !== null && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {errorTransicion}
              </p>
            )}
          </li>
        </ol>
      )}
    </section>
  );
}
