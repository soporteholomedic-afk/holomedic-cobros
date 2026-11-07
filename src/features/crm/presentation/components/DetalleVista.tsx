'use client';

import {
  ETAPAS_ABIERTAS,
  ETAPA_OPORTUNIDAD_LABELS,
  MEDIO_LABELS,
  MOTIVO_LABELS,
  type Empresa,
  type Oportunidad,
} from '../../domain/entities';
import { MEDIO_ESTILO, colorDeSector, lineasDeMotivo, ETAPA_PUNTO } from './crmUi';
import { faltaRuc } from './etiquetas';
import { HistorialContactos, fechaDeHistorial } from './HistorialContactos';
import { RucFaltante, type ResultadoRuc } from './RucFaltante';
import type { EstadoHistorial } from './useHistorial';

interface Props {
  empresa: Empresa;
  /** Every oportunidad of this empresa (S3: "Oportunidades — N registradas"). */
  oportunidades: Oportunidad[];
  /** Live SIGLA attention signal, loaded by the panel. */
  atencion: { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; etiqueta: string; ultimaAtencion: string | null };
  onCambiarMedio: (o: Oportunidad) => void;
  onEditarMotivo: (o: Oportunidad) => void;
  onGuardarRuc: (ruc: string, unir: boolean) => Promise<ResultadoRuc>;
  historial: EstadoHistorial;
  onReintentarHistorial: () => void;
  ahora: Date;
}

const TITULO = 'text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';
const ETIQUETA = 'text-xs text-slate-500 dark:text-slate-400';
const ENLACE = 'w-fit font-semibold text-sky-700 underline dark:text-sky-300';
const ACCION = 'w-fit text-[13px] font-semibold text-sky-700 underline dark:text-sky-300';
const CHIP_ETAPA =
  'inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';

/** "05/11/2026" from a Lima calendar day (`YYYY-MM-DD`); UTC keeps the day as stored. */
const formatoDiaMesAnio = (dia: string): string =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${dia}T00:00:00Z`),
  );

/** Where the SIGLA attention signal comes from (S6.6): services, never calls. */
const PISTA_ATENCION = 'Según las atenciones registradas en SIGLA; no se calcula con llamadas ni correos.';

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

/** Read-only view of an empresa ficha: who it is, what deals we have, what we talked about (S3). */
export function DetalleVista({
  empresa: e,
  oportunidades,
  atencion,
  onCambiarMedio,
  onEditarMotivo,
  onGuardarRuc,
  historial,
  onReintentarHistorial,
  ahora,
}: Props) {
  const varios = e.contactos.length > 1;
  const interacciones = historial.estado === 'listo' ? historial.interacciones : null;
  const ultimoContacto = interacciones?.[0]?.fecha;
  return (
    <div className="grid gap-5 px-6 pb-6 pt-3">
      <section className="grid gap-3">
        <h3 className={TITULO}>Empresa</h3>
        <dl className="grid gap-3 text-sm text-slate-900 dark:text-slate-100">
          <div className="grid gap-0.5">
            <dt className={ETIQUETA}>RUC</dt>
            <dd className="grid gap-1.5 tabular-nums">
              {faltaRuc(e) ? <RucFaltante razonSocial={e.razonSocial} onGuardar={onGuardarRuc} /> : e.ruc}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={ETIQUETA}>Sector</dt>
            <dd>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorDeSector(e.sector)}`}>
                {e.sector ?? 'Sin sector'}
              </span>
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={ETIQUETA} title={PISTA_ATENCION}>
              Actividad de servicios
            </dt>
            <dd data-atencion={atencion.estado} className="text-[13px] font-semibold" title={PISTA_ATENCION}>
              {atencion.estado === 'cargando' && <span className="text-slate-400 dark:text-slate-500">—</span>}
              {atencion.estado === 'error' && (
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  No se pudo consultar en SIGLA
                </span>
              )}
              {atencion.estado === 'listo' && (
                <>
                  {atencion.etiqueta}
                  {atencion.ultimaAtencion && ` · Última atención: ${formatoDiaMesAnio(atencion.ultimaAtencion)}`}
                </>
              )}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className={ETIQUETA}>Último contacto</dt>
            <dd className="text-[13px]" title="La fecha del contacto más reciente del historial.">
              {atencion.estado !== 'cargando' && !ultimoContacto && historial.estado !== 'listo' ? (
                <span className="text-slate-400 dark:text-slate-500">—</span>
              ) : ultimoContacto ? (
                fechaDeHistorial(ultimoContacto, ahora)
              ) : (
                <span className="text-slate-500 dark:text-slate-400">Sin contactos registrados</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-2">
        <h3 className={TITULO}>{`Oportunidades · ${oportunidades.length} ${oportunidades.length === 1 ? 'registrada' : 'registradas'}`}</h3>
        {oportunidades.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Sin oportunidades registradas.</p>
        )}
        <ul className="grid gap-2.5">
          {oportunidades.map((o) => {
            const estiloMedio = o.medio ? MEDIO_ESTILO[o.medio] : null;
            return (
              <li
                key={o.idOportunidad}
                data-oportunidad-id={o.idOportunidad}
                className="grid gap-2 rounded-xl border border-slate-200 px-3.5 py-3 text-sm dark:border-slate-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {o.nombre}
                  </span>
                  <span className={CHIP_ETAPA}>
                    <span className={`h-2 w-2 rounded-full ${ETAPA_PUNTO[o.etapa]}`} aria-hidden="true" />
                    {ETAPA_OPORTUNIDAD_LABELS[o.etapa]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.medio && estiloMedio ? (
                    <>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estiloMedio.chip}`}
                      >
                        <estiloMedio.icono className="h-3.5 w-3.5" aria-hidden="true" />
                        {o.medio === 'otro' && o.medioOtro ? o.medioOtro : MEDIO_LABELS[o.medio]}
                      </span>
                      <button type="button" onClick={conFoco(() => onCambiarMedio(o))} className={ACCION}>
                        Cambiar medio
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[13px] text-slate-500 dark:text-slate-400">Sin medio registrado</span>
                      {(ETAPAS_ABIERTAS as readonly string[]).includes(o.etapa) && (
                        <button type="button" onClick={conFoco(() => onCambiarMedio(o))} className={ACCION}>
                          Registrar medio
                        </button>
                      )}
                    </>
                  )}
                </div>
                {o.etapa === 'perdida' && o.motivo && (
                  <div className="grid gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">Motivo de la pérdida</h4>
                    <p className="font-semibold">{MOTIVO_LABELS[o.motivo.categoria]}</p>
                    {lineasDeMotivo(o).map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                    <button type="button" onClick={conFoco(() => onEditarMotivo(o))} className={ACCION}>
                      Editar motivo
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-2">
        <h3 className={TITULO}>{varios ? `Contactos (${e.contactos.length})` : 'Contacto'}</h3>
        <ul className="grid gap-2.5">
          {e.contactos.map((c, i) => (
            <li
              key={`${i}-${c.nombre}`}
              className="grid gap-2 rounded-xl border border-slate-200 px-3.5 py-3 text-sm dark:border-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{c.nombre ?? 'Sin nombre'}</span>
                {varios && i === 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-px text-[11px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                    Principal
                  </span>
                )}
              </div>
              <div className="grid gap-0.5">
                <span className={ETIQUETA}>Teléfono</span>
                {c.telefono ? (
                  <a href={`tel:${c.telefono.replace(/\D/g, '')}`} className={ENLACE}>
                    {c.telefono}
                  </a>
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400">Sin teléfono</span>
                )}
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

      <HistorialContactos
        historial={historial}
        oportunidades={oportunidades}
        onReintentar={onReintentarHistorial}
        ahora={ahora}
      />

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
