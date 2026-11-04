'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { CAMPO_ELEGIBLE, cerrarOtrosPopups, escucharCierre } from './crmUi';
import {
  DIAS_SEMANA,
  diasEntre,
  esFinDeSemana,
  esPasada,
  formatoCorto,
  formatoLargo,
  inicioDeSemana,
  mesDe,
  nombreDelMes,
  primerDiaHabil,
  semanasDelMes,
  sumarDias,
  sumarDiasHabiles,
  sumarMeses,
  sumarMesesADia,
} from './fechas';

interface CrmCalendarioProps {
  id: string;
  label: string;
  /** Chosen day as `YYYY-MM-DD`, or `null` when none. */
  value: string | null;
  /** Today as `YYYY-MM-DD`; the component never reads the clock. */
  hoy: string;
  /** Number of actions already scheduled per day, for the dots and the hint. */
  marcados?: Record<string, number>;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}

const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;

const acciones = (n: number) => `${n} ${n === 1 ? 'acción agendada' : 'acciones agendadas'}`;

/** "sábado 31 de octubre", the long date without the year. */
const diaYMes = (dia: string) => formatoLargo(dia).replace(/ de \d{4}$/, '');

/**
 * Date picker styled like the CRM (spec S8): a closed button with the long
 * date, quick dates, and a month dialog with past days disabled and dots on
 * days that already have actions. Keyboard model follows the ARIA date picker
 * dialog: arrows by day/week, Home/End by week, PageUp/PageDown by month.
 */
export function CrmCalendario({
  id,
  label,
  value,
  hoy,
  marcados = {},
  onChange,
  invalid = false,
  describedBy,
}: CrmCalendarioProps) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => mesDe(value && !esPasada(value, hoy) ? value : hoy));
  const [foco, setFoco] = useState<string | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const pedirFoco = useRef(false);

  const idDia = (v: string) => `${id}-d-${v}`;
  const idDialogo = `${id}-cal`;
  const idPista = `${id}-hint`;

  useEffect(() => {
    if (!abierto) return;
    return escucharCierre(id, raiz, () => setAbierto(false));
  }, [abierto, id]);

  const enMes = (v: string | null): v is string => !!v && mesDe(v) === mes && !esPasada(v, hoy);
  // Roving tabindex: the day with focus, else the chosen one, else today, else the 1st.
  const tabulable = [foco, value, hoy].find(enMes) ?? `${mes}-01`;

  useEffect(() => {
    if (!abierto || !pedirFoco.current) return;
    pedirFoco.current = false;
    document.getElementById(idDia(tabulable))?.focus();
  });

  function abrir() {
    cerrarOtrosPopups(id);
    setMes(mesDe(value && !esPasada(value, hoy) ? value : hoy));
    setFoco(null);
    pedirFoco.current = true;
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(v: string) {
    onChange(v);
    cerrar();
  }

  function rapida(v: string) {
    onChange(v);
    setMes(mesDe(v));
    setFoco(v);
  }

  function moverMes(n: number) {
    const nuevo = sumarMeses(mes, n);
    setMes(nuevo);
    setFoco(null);
    // "Mes anterior" disables itself on the month of today: keep focus inside the dialog.
    if (nuevo <= mesDe(hoy)) pedirFoco.current = true;
  }

  function teclaDialogo(ev: KeyboardEvent<HTMLDivElement>) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      cerrar();
      return;
    }
    const dia = (ev.target as HTMLElement).dataset.dia;
    if (!dia) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      elegir(dia);
      return;
    }
    let nuevo: string | null = null;
    switch (ev.key) {
      case 'ArrowLeft':
        nuevo = sumarDias(dia, -1);
        break;
      case 'ArrowRight':
        nuevo = sumarDias(dia, 1);
        break;
      case 'ArrowUp':
        nuevo = sumarDias(dia, -7);
        break;
      case 'ArrowDown':
        nuevo = sumarDias(dia, 7);
        break;
      case 'Home':
        nuevo = inicioDeSemana(dia);
        break;
      case 'End':
        nuevo = sumarDias(inicioDeSemana(dia), 6);
        break;
      case 'PageUp':
        nuevo = sumarMesesADia(dia, -1);
        break;
      case 'PageDown':
        nuevo = sumarMesesADia(dia, 1);
        break;
    }
    if (!nuevo) return;
    ev.preventDefault();
    if (esPasada(nuevo, hoy)) nuevo = hoy;
    setMes(mesDe(nuevo));
    setFoco(nuevo);
    pedirFoco.current = true;
  }

  const rapidas: [string, string][] = [
    ['Hoy', hoy],
    ['Próximo día hábil', sumarDiasHabiles(hoy, 1)],
    ['En 3 días hábiles', sumarDiasHabiles(hoy, 3)],
    ['En una semana', primerDiaHabil(sumarDias(hoy, 7))],
  ];

  let pista = '';
  if (value) {
    const dif = diasEntre(hoy, value);
    const cuando = dif < 0 ? 'Ya pasó.' : dif === 0 ? 'Es hoy.' : dif === 1 ? 'Es mañana.' : `Es en ${dif} días.`;
    const n = marcados[value] ?? 0;
    pista =
      cuando +
      (esFinDeSemana(value) ? ' Cae en fin de semana.' : '') +
      (n ? ` Ese día ya hay ${acciones(n)} en el CRM.` : '');
  }

  const estilo = invalid ? CAMPO_ELEGIBLE.invalido : value ? CAMPO_ELEGIBLE.elegido : CAMPO_ELEGIBLE.vacio;

  return (
    <div ref={raiz} className="relative grid gap-1.5" data-popup={id}>
      <span id={`${id}-l`} className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <button
        ref={boton}
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idDialogo}
        aria-labelledby={`${id}-l ${id}-txt`}
        aria-invalid={invalid || undefined}
        aria-describedby={[idPista, describedBy].filter(Boolean).join(' ')}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape' && abierto) {
            ev.stopPropagation();
            cerrar();
          }
        }}
        className={`${CAMPO_ELEGIBLE.base} ${estilo} ${abierto ? CAMPO_ELEGIBLE.abierto : ''}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
        <span id={`${id}-txt`} className={value ? '' : 'text-slate-400'}>
          {value ? formatoLargo(value) : 'Elige una fecha'}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''} ${value && !invalid ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500'}`}
          aria-hidden="true"
        />
      </button>

      <div role="group" aria-label="Fechas rápidas" className="flex flex-wrap gap-1.5">
        {rapidas.map(([texto, dia]) => {
          const activa = value === dia;
          return (
            <button
              key={texto}
              type="button"
              aria-pressed={activa}
              onClick={() => rapida(dia)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                activa
                  ? 'border-sky-500 bg-sky-50 font-bold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                  : 'border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {texto}{' '}
              <small className={`font-normal ${activa ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {formatoCorto(dia)}
              </small>
            </button>
          );
        })}
      </div>

      <p id={idPista} aria-live="polite" className="min-h-4 text-xs text-slate-500 dark:text-slate-400">
        {pista}
      </p>

      {abierto && (
        <div
          id={idDialogo}
          role="dialog"
          aria-modal="false"
          aria-label="Elegir la fecha de la próxima acción"
          onKeyDown={teclaDialogo}
          className="grid gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-2">
            <BotonMes etiqueta="Mes anterior" disabled={mes <= mesDe(hoy)} onClick={() => moverMes(-1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </BotonMes>
            <h4 aria-live="polite" className="flex-1 text-center text-sm font-bold text-slate-900 dark:text-slate-100">
              {nombreDelMes(mes)}
            </h4>
            <BotonMes etiqueta="Mes siguiente" onClick={() => moverMes(1)}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </BotonMes>
          </div>

          <table role="presentation" className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                {DIAS_SEMANA.map((d, i) => (
                  <th
                    key={d}
                    scope="col"
                    className="pb-1.5 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    <abbr title={NOMBRES_DIA[i]} className="no-underline">
                      {d}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanasDelMes(mes).map((semana) => (
                <tr key={semana.find(Boolean) ?? mes}>
                  {semana.map((dia, i) =>
                    dia ? (
                      <td key={dia} className="p-0.5 text-center">
                        <BotonDia
                          id={idDia(dia)}
                          dia={dia}
                          hoy={hoy}
                          seleccionado={dia === value}
                          tabulable={dia === tabulable}
                          n={marcados[dia] ?? 0}
                          onElegir={elegir}
                        />
                      </td>
                    ) : (
                      <td key={`v${i}`} />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              <span className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-amber-500 align-middle" aria-hidden="true" />
              Días con acciones ya agendadas
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => cerrar()}
              className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface BotonMesProps {
  etiqueta: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function BotonMes({ etiqueta, disabled, onClick, children }: BotonMesProps) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900"
    >
      {children}
    </button>
  );
}

interface BotonDiaProps {
  id: string;
  dia: string;
  hoy: string;
  seleccionado: boolean;
  tabulable: boolean;
  n: number;
  onElegir: (dia: string) => void;
}

function BotonDia({ id, dia, hoy, seleccionado, tabulable, n, onElegir }: BotonDiaProps) {
  const esHoy = dia === hoy;
  const pasado = esPasada(dia, hoy);
  const etiqueta = `${diaYMes(dia)}${esHoy ? ', hoy' : ''}${n ? `, ${acciones(n)}` : ''}`;

  let estilo: string;
  if (seleccionado) {
    estilo = 'bg-gradient-to-tr from-sky-600 to-blue-600 font-bold text-white shadow-md shadow-sky-600/25';
  } else if (pasado) {
    estilo = 'cursor-not-allowed text-slate-300 dark:text-slate-600';
  } else {
    const color = esFinDeSemana(dia) ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100';
    const hoyEstilo = esHoy ? 'font-bold text-sky-800 ring-1 ring-inset ring-sky-500 dark:text-sky-200' : color;
    estilo = `${hoyEstilo} hover:bg-sky-50 hover:text-sky-800 dark:hover:bg-sky-950/40 dark:hover:text-sky-200`;
  }

  return (
    <button
      type="button"
      id={id}
      data-dia={dia}
      tabIndex={tabulable ? 0 : -1}
      disabled={pasado}
      aria-label={etiqueta}
      aria-pressed={seleccionado}
      aria-current={esHoy ? 'date' : undefined}
      onClick={() => onElegir(dia)}
      className={`relative h-[38px] w-full rounded-lg text-[13px] tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${estilo}`}
    >
      {Number(dia.slice(8))}
      {n > 0 && (
        <span
          className={`absolute bottom-1 left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full ${seleccionado ? 'bg-white' : 'bg-amber-500'}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
