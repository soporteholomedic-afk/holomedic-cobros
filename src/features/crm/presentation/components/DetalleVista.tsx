'use client';

import { MEDIO_LABELS, MOTIVO_LABELS, type Empresa } from '../../domain/entities';
import { MEDIO_ESTILO, colorDeSector, lineasDeMotivo } from './crmUi';

interface Props {
  empresa: Empresa;
  onCambiarMedio: (e: Empresa) => void;
  onEditarMotivo: (e: Empresa) => void;
}

const TITULO = 'text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';
const ETIQUETA = 'text-xs text-slate-500 dark:text-slate-400';
const ENLACE = 'w-fit font-semibold text-sky-700 underline dark:text-sky-300';
const ACCION = 'w-fit text-[13px] font-semibold text-sky-700 underline dark:text-sky-300';
const BOTON =
  'h-10 w-fit rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

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
  const estiloMedio = e.medio ? MEDIO_ESTILO[e.medio] : null;
  return (
    <div className="grid gap-5 px-6 pb-6 pt-3">
      <section className="grid gap-3">
        <h3 className={TITULO}>Empresa</h3>
        <dl className="grid gap-3 text-sm text-slate-900 dark:text-slate-100">
          <div className="grid gap-0.5">
            <dt className={ETIQUETA}>RUC</dt>
            <dd className="tabular-nums">{e.ruc}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={ETIQUETA}>Sector</dt>
            <dd>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorDeSector(e.sector)}`}>
                {e.sector ?? 'Sin sector'}
              </span>
            </dd>
          </div>
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
              className="grid gap-2 rounded-xl border border-slate-200 px-3.5 py-3 text-sm dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{c.nombre}</span>
                {varios && i === 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-px text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                    Principal
                  </span>
                )}
              </div>
              <div className="grid gap-0.5">
                <span className={ETIQUETA}>Teléfono</span>
                <a href={`tel:${c.telefono.replace(/\D/g, '')}`} className={ENLACE}>
                  {c.telefono}
                </a>
              </div>
              <div className="grid gap-0.5">
                <span className={ETIQUETA}>Correo</span>
                {c.correo ? (
                  <a href={`mailto:${c.correo}`} className={`${ENLACE} break-all`}>
                    {c.correo}
                  </a>
                ) : (
                  <span className="text-slate-500">Sin correo registrado</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2">
        <h3 className={TITULO}>Seguimiento</h3>
        <span className={ETIQUETA}>Medio de contacto</span>
        {e.medio && estiloMedio ? (
          <>
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estiloMedio.chip}`}
            >
              <estiloMedio.icono className="h-3.5 w-3.5" aria-hidden="true" />
              {MEDIO_LABELS[e.medio]}
            </span>
            <button type="button" onClick={conFoco(() => onCambiarMedio(e))} className={BOTON}>
              Cambiar medio
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-slate-500">Sin medio registrado</span>
            {e.etapa !== 'por_contactar' && (
              <button type="button" onClick={conFoco(() => onCambiarMedio(e))} className={BOTON}>
                Registrar medio
              </button>
            )}
          </>
        )}
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
