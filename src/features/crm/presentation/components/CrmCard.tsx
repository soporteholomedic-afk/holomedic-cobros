'use client';

import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardPlus, Clock, Phone, Tag, User, type LucideIcon } from 'lucide-react';
import type { DragEvent } from 'react';

import {
  ACCION_LABELS,
  ETAPA_OPORTUNIDAD_LABELS,
  MEDIO_LABELS,
  MOTIVO_LABELS,
  ORIGEN_LABELS,
  type Empresa,
  type EtapaOportunidad,
  type Oportunidad,
} from '../../domain/entities';
import { MEDIO_ESTILO, colorDeSector, lineasDeMotivo, textoMonto } from './crmUi';
import { estadoProximaAccion, etiquetaDeTarjeta, faltaRuc, sugerenciaVisible, textoSugerencia, type TipoEtiqueta } from './etiquetas';
import { formatoCorto } from './fechas';

interface Props {
  /** The joined empresa ficha: name, RUC and sector live there, not on the deal (S2). */
  empresa: Empresa;
  /** The commercial deal this card shows — one card per oportunidad (S2). */
  oportunidad: Oportunidad;
  anterior: EtapaOportunidad | undefined;
  siguiente: EtapaOportunidad | undefined;
  onMover: (idOportunidad: string, etapa: EtapaOportunidad) => void;
  onEditarMedio: (o: Oportunidad) => void;
  onEditarMotivo: (o: Oportunidad) => void;
  /** Opens the ficha of the joined empresa. */
  onAbrir: (idEmpresa: string) => void;
  /** The detail panel is showing the empresa of this card. */
  seleccionada: boolean;
  onDragStart: (ev: DragEvent<HTMLElement>, idOportunidad: string) => void;
  /** Current instant, computed once per board render. */
  ahora: Date;
  /** Today as YYYY-MM-DD in the business time zone. */
  hoy: string;
  /** The user answered the "Pasar a Perdida" suggestion. */
  onSugerencia: (idOportunidad: string, accion: 'perder' | 'seguir') => void;
  /** "Registrar actividad": the activity panel will link this deal (T8). */
  onRegistrar: (idOportunidad: string) => void;
}

const ETIQUETA_BASE = 'inline-flex w-fit items-center gap-1.5 rounded-lg border px-2 py-[3px] text-xs font-semibold';
const AMBAR = 'border-amber-500/45 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
const ETIQUETA_ESTILO: Record<TipoEtiqueta, { clase: string; icono: LucideIcon | null }> = {
  conversamos: {
    clase: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    icono: Check,
  },
  sin_respuesta: { clase: AMBAR, icono: Phone },
  falta_responder: { clase: AMBAR, icono: Clock },
  intentos: {
    clase: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icono: null,
  },
};

const CHIP_NEUTRO =
  'inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';

const FLECHA =
  'grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700';

const BOTON_REGISTRAR =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

const BOTON_RESPONDER =
  'inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-tr from-sky-600 to-blue-600 px-2.5 text-xs font-semibold text-white shadow-md shadow-sky-600/25 hover:brightness-110';

const BOTON_SUG =
  'h-7 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

export function CrmCard({
  empresa: e,
  oportunidad: o,
  anterior,
  siguiente,
  onMover,
  onEditarMedio,
  onEditarMotivo,
  onAbrir,
  seleccionada,
  onDragStart,
  ahora,
  hoy,
  onSugerencia,
  onRegistrar,
}: Props) {
  const perdida = o.etapa === 'perdida';
  const estiloMedio = o.medio ? MEDIO_ESTILO[o.medio] : null;
  const etiqueta = etiquetaDeTarjeta(o, ahora);
  const estiloEtiqueta = etiqueta ? ETIQUETA_ESTILO[etiqueta.tipo] : null;
  const estadoAccion = estadoProximaAccion(o, hoy);
  const accion = estadoAccion !== 'ninguna' ? o.proximaAccion : null;
  const textoAccion = accion ? (accion.tipo === 'otro' && accion.detalle ? accion.detalle : ACCION_LABELS[accion.tipo]) : '';

  return (
    <article
      draggable
      tabIndex={0}
      // DOM attribute name kept for the vuelo/focus selectors: it holds the idOportunidad of the card.
      data-empresa-id={o.idOportunidad}
      aria-current={seleccionada ? 'true' : undefined}
      onDragStart={(ev) => onDragStart(ev, o.idOportunidad)}
      onClick={(ev) => {
        // The buttons inside the card do their own thing.
        if ((ev.target as HTMLElement).closest('button')) return;
        onAbrir(e.idEmpresa);
      }}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        onAbrir(e.idEmpresa);
      }}
      className={`group cursor-pointer rounded-xl border bg-white px-3 pb-2 pt-3 shadow-sm hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-slate-800 ${
        seleccionada ? 'ring-2 ring-sky-500' : ''
      } ${perdida
          ? 'border-red-200 border-l-[3px] border-l-red-300 dark:border-red-900 dark:border-l-red-800'
          : 'border-slate-200 dark:border-slate-700'}`}
    >
      <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">{e.razonSocial}</h3>
      <p className="mb-1 mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-400">{o.nombre}</p>
      {faltaRuc(e) ? (
        <span className={`mb-2 mt-1 ${ETIQUETA_BASE} ${AMBAR}`}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Falta RUC
        </span>
      ) : (
        <p className="mb-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">{`RUC ${e.ruc}`}</p>
      )}
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorDeSector(e.sector)}`}>
        {e.sector ?? 'Sin sector'}
      </span>

      {(o.servicio || o.responsableNombre) && (
        <div className="mt-2.5 grid gap-1 text-[13px] text-slate-700 dark:text-slate-300">
          {o.servicio && (
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              <span>{o.servicio}</span>
            </div>
          )}
          {o.responsableNombre && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
              <span>{o.responsableNombre}</span>
            </div>
          )}
        </div>
      )}

      {o.montoEstimado !== null && (
        <p className="mt-1.5 text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">{textoMonto(o.montoEstimado)}</p>
      )}

      {(o.origen || o.migrada) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {o.origen && <span className={CHIP_NEUTRO}>{ORIGEN_LABELS[o.origen]}</span>}
          {o.migrada && <span className={CHIP_NEUTRO}>Migrada</span>}
        </div>
      )}

      {o.medio && estiloMedio && (
        <button
          type="button"
          onClick={() => onEditarMedio(o)}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estiloMedio.chip}`}
        >
          <estiloMedio.icono className="h-3.5 w-3.5" aria-hidden="true" />
          {`Medio: ${o.medio === 'otro' && o.medioOtro ? o.medioOtro : MEDIO_LABELS[o.medio]}`}
        </button>
      )}

      {etiqueta && estiloEtiqueta && (
        <div className="mt-2">
          <span className={`${ETIQUETA_BASE} ${estiloEtiqueta.clase}`}>
            {estiloEtiqueta.icono && <estiloEtiqueta.icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {etiqueta.texto}
          </span>
        </div>
      )}

      {accion && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            estadoAccion === 'vencida'
              ? 'font-semibold text-red-800 dark:text-red-300'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {`${estadoAccion === 'vencida' ? 'Vencida' : 'Próximo'}: ${textoAccion} · ${formatoCorto(accion.fecha)}`}
        </div>
      )}

      {perdida && o.motivo && (
        <div className="mt-2 grid gap-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">{`Motivo · ${MOTIVO_LABELS[o.motivo.categoria]}`}</span>
          {lineasDeMotivo(o).map((l) => (
            <span key={l}>{l}</span>
          ))}
          <button
            type="button"
            onClick={() => onEditarMotivo(o)}
            className="mt-1 w-fit text-xs font-semibold text-sky-800 underline dark:text-sky-300"
          >
            Editar motivo
          </button>
        </div>
      )}

      {sugerenciaVisible(o) && (
        <div
          role="group"
          aria-label={`Sugerencia para ${o.nombre}`}
          className="mt-2 grid gap-1.5 rounded-lg border border-amber-500 bg-amber-100 p-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <p>{textoSugerencia(o)}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onSugerencia(o.idOportunidad, 'perder')} className={BOTON_SUG}>
              Pasar a Perdida
            </button>
            <button type="button" onClick={() => onSugerencia(o.idOportunidad, 'seguir')} className={BOTON_SUG}>
              Seguir intentando
            </button>
          </div>
        </div>
      )}

      {!perdida && (
        <div className="mt-2.5">
          {/* Safari does not focus a button on click: focus it first so the panel gives the focus back here. */}
          <button
            type="button"
            onClick={(ev) => {
              ev.currentTarget.focus();
              onRegistrar(o.idOportunidad);
            }}
            className={etiqueta?.tipo === 'falta_responder' ? BOTON_RESPONDER : BOTON_REGISTRAR}
          >
            {etiqueta?.tipo === 'falta_responder' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ClipboardPlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {etiqueta?.tipo === 'falta_responder' ? 'Responder' : 'Registrar actividad'}
          </button>
        </div>
      )}

      <div className="mt-1.5 flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {anterior ? (
          <button
            type="button"
            aria-label={`Mover ${o.nombre} a ${ETAPA_OPORTUNIDAD_LABELS[anterior]}`}
            data-mover="-1"
            onClick={() => onMover(o.idOportunidad, anterior)}
            className={FLECHA}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" disabled aria-label="Sin columna anterior" data-mover="-1" className={`${FLECHA} opacity-30`}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {siguiente ? (
          <button
            type="button"
            aria-label={`Mover ${o.nombre} a ${ETAPA_OPORTUNIDAD_LABELS[siguiente]}`}
            data-mover="1"
            onClick={() => onMover(o.idOportunidad, siguiente)}
            className={FLECHA}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" disabled aria-label="Sin columna siguiente" data-mover="1" className={`${FLECHA} opacity-30`}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
