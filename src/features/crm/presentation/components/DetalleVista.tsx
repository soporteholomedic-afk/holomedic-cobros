'use client';

import { ETAPA_LABELS, MEDIO_LABELS, MOTIVO_LABELS, type Empresa } from '../../domain/entities';
import { colorDeSector, lineasDeMotivo } from './crmUi';

interface Props {
  empresa: Empresa;
  onCambiarMedio: (e: Empresa) => void;
  onEditarMotivo: (e: Empresa) => void;
}

const TITULO = 'text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';
const ENLACE = 'text-sky-700 hover:underline dark:text-sky-300';
const ACCION = 'w-fit text-[13px] font-semibold text-sky-700 underline dark:text-sky-300';

/**
 * Safari does not focus a button on click. Focus it first so the dialog that
 * opens over the panel hands the focus back to this very button on close.
 */
function conFoco(accion: () => void) {
  return (ev: { currentTarget: HTMLElement }) => {
    ev.currentTarget.focus();
    accion();
  };
}

/** Read-only view of an empresa inside the detail panel. */
export function DetalleVista({ empresa: e, onCambiarMedio, onEditarMotivo }: Props) {
  const varios = e.contactos.length > 1;
  return (
    <div className="grid gap-5 px-6 pb-6 pt-3">
      <section className="grid gap-2">
        <h3 className={TITULO}>Empresa</h3>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm text-slate-800 dark:text-slate-200">
          <dt className="text-slate-500">RUC</dt>
          <dd className="tabular-nums">{e.ruc}</dd>
          <dt className="text-slate-500">Sector</dt>
          <dd>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorDeSector(e.sector)}`}>
              {e.sector ?? 'Sin sector'}
            </span>
          </dd>
          <dt className="text-slate-500">Etapa</dt>
          <dd>
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold dark:border-slate-700">
              {ETAPA_LABELS[e.etapa]}
            </span>
          </dd>
          <dt className="text-slate-500">Medio</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {e.medio ? <span>{MEDIO_LABELS[e.medio]}</span> : <span className="text-slate-500">Sin medio registrado</span>}
            {e.medio && (
              <button type="button" onClick={conFoco(() => onCambiarMedio(e))} className={ACCION}>
                Cambiar medio
              </button>
            )}
            {!e.medio && e.etapa !== 'por_contactar' && (
              <button type="button" onClick={conFoco(() => onCambiarMedio(e))} className={ACCION}>
                Registrar medio
              </button>
            )}
          </dd>
        </dl>
      </section>

      {e.etapa === 'perdido' && e.motivo && (
        <section className="grid gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          <h3 className="text-xs font-bold uppercase tracking-wider">Motivo de la pérdida</h3>
          <p className="font-semibold">{MOTIVO_LABELS[e.motivo.categoria]}</p>
          {lineasDeMotivo(e).map((l) => (
            <p key={l}>{l}</p>
          ))}
          <button type="button" onClick={conFoco(() => onEditarMotivo(e))} className={ACCION}>
            Editar motivo
          </button>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className={TITULO}>{varios ? `Contactos (${e.contactos.length})` : 'Contacto'}</h3>
        <ul className="grid gap-2.5">
          {e.contactos.map((c, i) => (
            <li
              key={`${i}-${c.nombre}`}
              className="grid gap-0.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{c.nombre}</span>
                {varios && i === 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-px text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                    Principal
                  </span>
                )}
              </div>
              <a href={`tel:${c.telefono.replace(/\D/g, '')}`} className={ENLACE}>
                {c.telefono}
              </a>
              {c.correo ? (
                <a href={`mailto:${c.correo}`} className={ENLACE}>
                  {c.correo}
                </a>
              ) : (
                <span className="text-slate-500">Sin correo registrado</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-1.5">
        <h3 className={TITULO}>Notas</h3>
        {e.notas ? (
          <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{e.notas}</p>
        ) : (
          <p className="text-sm text-slate-500">Sin notas</p>
        )}
      </section>
    </div>
  );
}
