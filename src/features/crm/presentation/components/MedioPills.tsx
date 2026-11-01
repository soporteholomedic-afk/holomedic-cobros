'use client';

import type { ReactNode } from 'react';

import { MEDIOS, MEDIO_LABELS, type Medio } from '../../domain/entities';
import { ERROR_CAMPO, ETIQUETA_CAMPO, INPUT_VALIDABLE, LEYENDA, MEDIO_ESTILO } from './crmUi';

interface PildoraProps {
  name: string;
  value: string;
  marcada: boolean;
  onElegir: () => void;
  /** Classes of the pill while it is chosen. */
  claseMarcada?: string;
  children: ReactNode;
}

const PILDORA = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px]';
const PILDORA_LIBRE =
  'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const PILDORA_ELEGIDA =
  'border-sky-500 bg-sky-50 font-bold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200';

/** One option of a radio group drawn as a pill. The native radio stays on top, invisible, for mouse and keyboard. */
export function PildoraRadio({ name, value, marcada, onElegir, claseMarcada = PILDORA_ELEGIDA, children }: PildoraProps) {
  return (
    <label className="relative inline-flex">
      <input
        type="radio"
        name={name}
        value={value}
        checked={marcada}
        onChange={onElegir}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span
        className={`${PILDORA} ${marcada ? claseMarcada : PILDORA_LIBRE} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-500`}
      >
        {children}
      </span>
    </label>
  );
}

interface Props {
  /** Prefix of the DOM ids and of the radio group name. */
  base: string;
  leyenda: string;
  medio: Medio;
  medioOtro: string;
  onMedio: (medio: Medio) => void;
  onMedioOtro: (texto: string) => void;
  /** Message of "Escribe cuál fue el medio." while it is rejected. */
  error?: string;
}

/** Contact medium as pills, with "¿Cuál?" when it is Otro (spec S7). */
export function MedioPills({ base, leyenda, medio, medioOtro, onMedio, onMedioOtro, error }: Props) {
  const idOtro = `${base}-otro`;
  const idError = `${idOtro}-err`;
  return (
    <fieldset className="grid gap-2.5">
      <legend className={LEYENDA}>{leyenda}</legend>
      <div className="flex flex-wrap gap-2">
        {MEDIOS.map((m) => {
          const { icono: Icono, chip } = MEDIO_ESTILO[m];
          return (
            <PildoraRadio
              key={m}
              name={`${base}-medio`}
              value={m}
              marcada={medio === m}
              onElegir={() => onMedio(m)}
              claseMarcada={`${chip} font-bold`}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden="true" />
              {MEDIO_LABELS[m]}
            </PildoraRadio>
          );
        })}
      </div>
      {medio === 'otro' && (
        <div className={ETIQUETA_CAMPO}>
          <label htmlFor={idOtro}>¿Cuál?</label>
          <input
            id={idOtro}
            value={medioOtro}
            maxLength={40}
            onChange={(ev) => onMedioOtro(ev.target.value)}
            placeholder="Ej. Visita en persona, LinkedIn, feria"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className={INPUT_VALIDABLE}
          />
          {error && (
            <p id={idError} role="alert" className={ERROR_CAMPO}>
              {error}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
