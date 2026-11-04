'use client';

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

import { MEDIO_LABELS, type Interaccion, type Resultado } from '../../domain/entities';
import { MEDIO_ESTILO } from './crmUi';
import { diasEntre, formatoCorto, hoyEnZona } from './fechas';
import type { EstadoHistorial } from './useHistorial';

interface Props {
  historial: EstadoHistorial;
  onReintentar: () => void;
  ahora: Date;
}

const TITULO = 'text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400';

const TEXTO_RESULTADO: Record<Resultado, string> = {
  conversamos: 'Conversamos',
  no_contesto: 'No contestó',
  deje_mensaje: 'Dejé mensaje',
  pendiente: 'Nos contactó · falta responder',
  respondido: 'Nos contactó · ya le respondimos',
};

const medioTxt = (i: Interaccion): string => (i.medio === 'otro' && i.medioOtro ? i.medioOtro : MEDIO_LABELS[i.medio]);

function hora(f: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(f);
}

/** "Hoy 10:15", "Ayer 16:40" or "mié 28 oct · 16:40", in Lima time. */
export function fechaDeHistorial(iso: string, ahora: Date): string {
  const f = new Date(iso);
  const dia = hoyEnZona(f);
  const diff = diasEntre(dia, hoyEnZona(ahora));
  if (diff === 0) return `Hoy ${hora(f)}`;
  if (diff === 1) return `Ayer ${hora(f)}`;
  return `${formatoCorto(dia)} · ${hora(f)}`;
}

/** "Historial (N)" section of the detail panel: a vertical timeline, newest first. */
export function HistorialContactos({ historial, onReintentar, ahora }: Props) {
  const lista = historial.estado === 'listo' ? historial.interacciones : null;
  return (
    <section className="grid gap-2">
      <h3 className={TITULO}>
        Historial{' '}
        {lista && <span className="font-semibold normal-case tracking-normal text-slate-500 dark:text-slate-400">({lista.length})</span>}
      </h3>

      {historial.estado === 'cargando' && (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
          Cargando historial…
        </p>
      )}

      {historial.estado === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          <span className="flex-1">No se pudo cargar el historial.</span>
          <button
            type="button"
            onClick={onReintentar}
            className="rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold hover:bg-red-100 dark:border-red-800 dark:bg-transparent"
          >
            Reintentar
          </button>
        </div>
      )}

      {lista && lista.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay contactos registrados.</p>
      )}

      {lista && lista.length > 0 && (
        <ol className="grid">
          {lista.map((h) => {
            const estilo = MEDIO_ESTILO[h.medio];
            const Flecha = h.direccion === 'entrante' ? ArrowDownLeft : ArrowUpRight;
            return (
              <li
                key={h.idInteraccion}
                className="grid grid-cols-[32px_1fr] gap-x-2.5 gap-y-0.5 border-b border-slate-200 py-2.5 text-[13px] last:border-b-0 dark:border-slate-700"
              >
                <span
                  data-medio-icono
                  title={medioTxt(h)}
                  className={`row-span-3 grid h-8 w-8 place-items-center rounded-full border ${estilo.chip}`}
                >
                  <estilo.icono className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <Flecha className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {`${h.direccion === 'entrante' ? 'Nos contactó' : 'Contactamos'} · ${medioTxt(h)}`}
                </span>
                <span>
                  <b className="text-slate-900 dark:text-slate-100">{TEXTO_RESULTADO[h.resultado]}</b>{' '}
                  <small className="text-slate-500 dark:text-slate-400">{` · ${fechaDeHistorial(h.fecha, ahora)} · ${h.nombreUsuario}`}</small>
                </span>
                {h.resumen && <p className="mt-0.5 text-slate-700 dark:text-slate-300">{h.resumen}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
