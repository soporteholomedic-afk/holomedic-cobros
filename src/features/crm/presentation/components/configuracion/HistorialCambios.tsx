'use client';

import { useId, useState } from 'react';

import { useAuditoriaConfig, type FilaAuditoriaConfig } from '../../hooks/useAuditoriaConfig';
import { CLASES_TARJETA } from './estilos';

/**
 * HistorialCambios (agente-ia-crm E5·T6) — collapsible change history
 * of the active tab (last 20 audit rows for its key prefix). The
 * query only runs while the panel is open. Secret rows show only
 * "secreto modificado": the audit never carries their values.
 */

interface HistorialCambiosProps {
  prefijo: string;
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const dos = (n: number): string => String(n).padStart(2, '0');
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}

function describirCambio(fila: FilaAuditoriaConfig): string {
  if (fila.esSecreto) return 'secreto modificado';
  return `${fila.valorAnterior ?? '(vacío)'} → ${fila.valorNuevo ?? '(vacío)'}`;
}

function ListaHistorial({ prefijo }: HistorialCambiosProps) {
  const { filas, status, error } = useAuditoriaConfig(prefijo);

  if (status === 'loading') return <p className="text-sm text-slate-600 dark:text-slate-400">Cargando historial…</p>;
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
        {error}
      </p>
    );
  }
  if (filas.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Aún no hay cambios registrados.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {filas.map((fila) => (
        <li key={fila.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-baseline sm:gap-4">
          <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{fila.clave}</span>
          <span className="break-all text-slate-900 dark:text-slate-100">{describirCambio(fila)}</span>
          <span className="text-slate-700 dark:text-slate-300 sm:ml-auto">{fila.usuario}</span>
          <time dateTime={fila.creadoEn} className="text-xs text-slate-600 dark:text-slate-400">
            {formatearFecha(fila.creadoEn)}
          </time>
        </li>
      ))}
    </ul>
  );
}

export function HistorialCambios({ prefijo }: HistorialCambiosProps) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();

  return (
    <section className={CLASES_TARJETA}>
      <h3>
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls={idPanel}
          onClick={() => setAbierto((previo) => !previo)}
          className="flex w-full items-center justify-between rounded-lg text-left text-base font-semibold text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400"
        >
          <span>Historial de cambios</span>
          <span aria-hidden="true" className="text-slate-600 dark:text-slate-400">
            {abierto ? '▾' : '▸'}
          </span>
        </button>
      </h3>
      <div id={idPanel} hidden={!abierto} className="mt-3">
        {abierto && <ListaHistorial prefijo={prefijo} />}
      </div>
    </section>
  );
}
