'use client';

import { AlarmClockOff, BellRing, Clock3 } from 'lucide-react';

import type { AlertaCrm, ClaseAlerta } from '../../application/calcularAlertas';
import { ACCION_LABELS } from '../../domain/entities';
import { useAlertasDia } from './useAlertasDia';

interface PanelDiaProps {
  /** The board bumps this after every mutation; each bump refetches. */
  reloadKey: number;
  /** Focuses the oportunidad's card, or opens the ficha when the deal is not on the board (the panel never navigates away). */
  onAbrir: (idOportunidad: string, idEmpresa: string) => void;
}

interface Grupo {
  clase: ClaseAlerta;
  titulo: string;
  icono: typeof Clock3;
  chip: string;
}

/** Render order matches the API order (vencidas, hoy, sin responder). */
const GRUPOS: readonly Grupo[] = [
  { clase: 'accion_vencida', titulo: 'Vencidas', icono: AlarmClockOff, chip: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  { clase: 'accion_hoy', titulo: 'Vencen hoy', icono: Clock3, chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { clase: 'sin_responder', titulo: 'Sin respuesta', icono: BellRing, chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
];

/** "Enviar cotización: Enviar precios OBRA · 2 días de atraso"; "… · 52 h esperando". */
function textoAlerta(a: AlertaCrm): string {
  if (a.clase === 'sin_responder') return `Nos contactaron y falta responder · ${a.atraso} h esperando`;
  const accion = a.tipoAccion ? ACCION_LABELS[a.tipoAccion] : 'Próxima acción';
  const detalle = a.detalle ? `: ${a.detalle}` : '';
  const atraso = a.clase === 'accion_vencida' ? ` · ${a.atraso} ${a.atraso === 1 ? 'día' : 'días'} de atraso` : '';
  return `${accion}${detalle}${atraso}`;
}

/**
 * "Tu día" panel (crm-notificaciones S1/S5): the in-app front of the
 * pending-work alerts, above the board on /crm. Renders NOTHING when there
 * are no alerts — the panel only ever appears when there is work to do.
 */
export function PanelDia({ reloadKey, onAbrir }: PanelDiaProps) {
  const { datos, error, recargar } = useAlertasDia(reloadKey);

  if (error) {
    return (
      <div
        role="alert"
        className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <span className="flex-1">No se pudieron cargar las alertas del día</span>
        <button
          type="button"
          onClick={recargar}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 font-semibold hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!datos || datos.alertas.length === 0) return null;

  return (
    <section
      aria-label="Tu día"
      className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Tu día</h2>
        <span
          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {datos.alertas.length} pendiente{datos.alertas.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {GRUPOS.map((grupo) => {
          const deClase = datos.alertas.filter((a) => a.clase === grupo.clase);
          if (deClase.length === 0) return null;
          const Icono = grupo.icono;
          return (
            <div key={grupo.clase}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Icono className="h-4 w-4" aria-hidden="true" />
                {grupo.titulo}
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${grupo.chip}`}>{deClase.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {deClase.map((a) => (
                  <li key={`${a.clase}-${a.idOportunidad}`}>
                    <button
                      type="button"
                      onClick={() => onAbrir(a.idOportunidad, a.idEmpresa)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-sky-500 dark:hover:bg-slate-800"
                    >
                      <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{a.nombreOportunidad}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{a.nombreEmpresa}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{textoAlerta(a)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
