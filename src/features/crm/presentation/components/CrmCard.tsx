'use client';

import { ChevronLeft, ChevronRight, Phone, User } from 'lucide-react';
import type { DragEvent } from 'react';

import { ETAPA_LABELS, MEDIO_LABELS, MOTIVO_LABELS, type Empresa, type Etapa } from '../../domain/entities';
import { MEDIO_ESTILO, colorDeSector, lineasDeMotivo } from './crmUi';

interface Props {
  empresa: Empresa;
  anterior: Etapa | undefined;
  siguiente: Etapa | undefined;
  onMover: (id: string, etapa: Etapa) => void;
  onEditarMedio: (empresa: Empresa) => void;
  onEditarMotivo: (empresa: Empresa) => void;
  onAbrir: (id: string) => void;
  /** The detail panel is showing this card. */
  seleccionada: boolean;
  onDragStart: (ev: DragEvent<HTMLElement>, id: string) => void;
}

const FLECHA =
  'grid h-7 w-7 place-items-center rounded-lg text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700';

export function CrmCard({
  empresa: e,
  anterior,
  siguiente,
  onMover,
  onEditarMedio,
  onEditarMotivo,
  onAbrir,
  seleccionada,
  onDragStart,
}: Props) {
  const principal = e.contactos[0];
  const extra = e.contactos.length - 1;
  const perdida = e.etapa === 'perdido';
  const estiloMedio = e.medio ? MEDIO_ESTILO[e.medio] : null;

  return (
    <article
      draggable
      tabIndex={0}
      data-empresa-id={e.idEmpresa}
      aria-current={seleccionada ? 'true' : undefined}
      onDragStart={(ev) => onDragStart(ev, e.idEmpresa)}
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
      <p className="mb-2 mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">RUC {e.ruc}</p>
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorDeSector(e.sector)}`}>
        {e.sector ?? 'Sin sector'}
      </span>

      {principal && (
        <div className="mt-2.5 grid gap-1 text-[13px] text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>{principal.nombre}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span>{principal.telefono}</span>
          </div>
          {extra > 0 && (
            <span className="w-fit rounded-full bg-sky-100 px-2 py-px text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              {`+${extra} ${extra === 1 ? 'contacto' : 'contactos'}`}
            </span>
          )}
        </div>
      )}

      {e.medio && estiloMedio && (
        <button
          type="button"
          onClick={() => onEditarMedio(e)}
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estiloMedio.chip}`}
        >
          <estiloMedio.icono className="h-3.5 w-3.5" aria-hidden="true" />
          {`Medio: ${MEDIO_LABELS[e.medio]}`}
        </button>
      )}

      {perdida && e.motivo && (
        <div className="mt-2 grid gap-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">{`Motivo · ${MOTIVO_LABELS[e.motivo.categoria]}`}</span>
          {lineasDeMotivo(e).map((l) => (
            <span key={l}>{l}</span>
          ))}
          <button
            type="button"
            onClick={() => onEditarMotivo(e)}
            className="mt-1 w-fit text-xs font-semibold text-sky-800 underline dark:text-sky-300"
          >
            Editar motivo
          </button>
        </div>
      )}

      <div className="mt-1.5 flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {anterior ? (
          <button
            type="button"
            aria-label={`Mover ${e.razonSocial} a ${ETAPA_LABELS[anterior]}`}
            data-mover="-1"
            onClick={() => onMover(e.idEmpresa, anterior)}
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
            aria-label={`Mover ${e.razonSocial} a ${ETAPA_LABELS[siguiente]}`}
            data-mover="1"
            onClick={() => onMover(e.idEmpresa, siguiente)}
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
