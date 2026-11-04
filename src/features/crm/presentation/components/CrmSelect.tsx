'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, type LucideIcon } from 'lucide-react';

import { CAMPO_ELEGIBLE, cerrarOtrosPopups, escucharCierre } from './crmUi';

export interface OpcionSelect<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  description?: string;
  /** Draw a divider above this option (e.g. "Otro"). */
  separada?: boolean;
}

interface CrmSelectProps<T extends string> {
  id: string;
  label: string;
  value: T | null;
  options: OpcionSelect<T>[];
  placeholder: string;
  onChange: (value: T) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Text after the label, e.g. "(opcional)". */
  nota?: string;
}

/**
 * Single-choice menu styled like the CRM (spec S8, S9): a button that opens a
 * listbox. Follows the ARIA select-only combobox keyboard model: arrows wrap,
 * Home/End, first-letter typeahead, Enter/Space choose, Escape closes.
 */
export function CrmSelect<T extends string>({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  invalid = false,
  describedBy,
  nota,
}: CrmSelectProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  const elegida = options.find((o) => o.value === value) ?? null;
  const idLista = `${id}-menu`;
  const idOpcion = (i: number) => `${id}-o-${options[i]?.value}`;

  useEffect(() => {
    if (!abierto) return;
    lista.current?.focus();
    return escucharCierre(id, raiz, () => setAbierto(false));
  }, [abierto, id]);

  useEffect(() => {
    if (abierto) document.getElementById(idOpcion(activa))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idOpcion only depends on id and options
  }, [abierto, activa]);

  function abrir() {
    cerrarOtrosPopups(id);
    const i = options.findIndex((o) => o.value === value);
    setActiva(i < 0 ? 0 : i);
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(i: number) {
    const o = options[i];
    if (!o) return;
    onChange(o.value);
    cerrar();
  }

  function teclaBoton(ev: KeyboardEvent<HTMLButtonElement>) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      abrir();
    }
  }

  function teclaLista(ev: KeyboardEvent<HTMLUListElement>) {
    const n = options.length;
    const mover = (i: number) => setActiva(((i % n) + n) % n);
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        mover(activa + 1);
        return;
      case 'ArrowUp':
        ev.preventDefault();
        mover(activa - 1);
        return;
      case 'Home':
        ev.preventDefault();
        mover(0);
        return;
      case 'End':
        ev.preventDefault();
        mover(n - 1);
        return;
      case 'Enter':
      case ' ':
        ev.preventDefault();
        elegir(activa);
        return;
      case 'Escape':
        ev.preventDefault();
        ev.stopPropagation();
        cerrar();
        return;
      case 'Tab':
        cerrar(false);
        return;
    }
    if (ev.key.length === 1) {
      const letra = ev.key.toLowerCase();
      const empieza = (i: number) => options[i].label.toLowerCase().startsWith(letra);
      const orden = [...Array(n).keys()].map((k) => (activa + 1 + k) % n);
      const k = orden.find(empieza);
      if (k !== undefined) mover(k);
    }
  }

  const IconoElegido = elegida?.icon;
  const estilo = invalid ? CAMPO_ELEGIBLE.invalido : elegida ? CAMPO_ELEGIBLE.elegido : CAMPO_ELEGIBLE.vacio;

  return (
    <div ref={raiz} className="relative grid gap-1.5" data-popup={id}>
      <span id={`${id}-l`} className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {nota && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">{nota}</span>}
      </span>
      <button
        ref={boton}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-labelledby={`${id}-l ${id}-txt`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={teclaBoton}
        className={`${CAMPO_ELEGIBLE.base} ${estilo} ${abierto ? CAMPO_ELEGIBLE.abierto : ''}`}
      >
        {IconoElegido && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-tr from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/25">
            <IconoElegido className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <span id={`${id}-txt`} className={elegida ? '' : 'text-slate-400'}>
          {elegida ? elegida.label : placeholder}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''} ${elegida && !invalid ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500'}`}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-l`}
          aria-activedescendant={idOpcion(activa)}
          onKeyDown={teclaLista}
          className="absolute left-0 right-0 top-full z-20 mt-1 grid max-h-[460px] gap-0.5 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((o, i) => {
            const sel = o.value === value;
            const act = i === activa;
            const Icono = o.icon;
            return (
              <li
                key={o.value}
                id={idOpcion(i)}
                role="option"
                aria-selected={sel}
                onClick={() => elegir(i)}
                onMouseMove={() => setActiva(i)}
                className={[
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100',
                  o.separada && i > 0 ? 'mt-1 rounded-t-none border-t border-slate-200 pt-2.5 dark:border-slate-700' : '',
                  sel ? 'bg-sky-100 ring-1 ring-inset ring-sky-300 dark:bg-sky-950/60 dark:ring-sky-800' : 'hover:bg-sky-50 dark:hover:bg-sky-950/30',
                  act ? 'bg-sky-50 ring-2 ring-inset ring-sky-500 dark:bg-sky-950/40' : '',
                ].join(' ')}
              >
                {Icono && (
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${sel ? 'bg-gradient-to-tr from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/25' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  >
                    <Icono className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <span className="grid min-w-0 flex-1 gap-px">
                  <b className={`font-semibold ${sel ? 'text-sky-800 dark:text-sky-200' : ''}`}>{o.label}</b>
                  {o.description && (
                    <small className={`text-xs ${sel ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      {o.description}
                    </small>
                  )}
                </span>
                <Check
                  className={`h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300 ${sel ? 'visible' : 'invisible'}`}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
