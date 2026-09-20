'use client';

import { useState, type FormEvent } from 'react';

import type { FilaCartera } from '../../application/listarCartera';
import { ETIQUETA_ACCION_ASIGNACION, formatearFecha } from '../etiquetas';
import { useAsignaciones } from '../hooks/useAsignaciones';
import { ModalBase } from './ModalBase';

/**
 * PanelAsignacion — the per-empresa assignment panel (tasks pr15/WU2,
 * spec G5). Inside a ModalBase shell it shows the assignment HISTORY
 * (ASIGNADO/REASIGNADO/DEVUELTO with actor and timestamp — the
 * traceability scenario) and the two management actions:
 *
 * - `crm_admin`: the Responsable input + Asignar/Reasignar button
 *   (label follows the current owner; both hit pr14's
 *   POST .../asignar with {responsable} — the server derives the
 *   action).
 * - A plain user (owner of the row): "Devolver al pool" → pr14's
 *   POST .../devolver (the server enforces owner-or-admin).
 *
 * A successful action notifies the parent (`onCambio`) so the cartera
 * refreshes; API errors surface in Spanish verbatim (repo convention).
 */
export interface PanelAsignacionProps {
  empresa: FilaCartera;
  esAdmin: boolean;
  onSalir: () => void;
  onCambio: () => void;
}

export function PanelAsignacion({ empresa, esAdmin, onSalir, onCambio }: PanelAsignacionProps) {
  const [responsable, setResponsable] = useState('');
  const { asignaciones, status, error, accionError, accionEnCurso, asignar, devolver } =
    useAsignaciones(empresa.empresaId);

  async function enviarAsignacion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nombre = responsable.trim();
    if (nombre === '') return;
    if (await asignar(nombre)) {
      setResponsable('');
      onCambio();
    }
  }

  async function devolverAlPool(): Promise<void> {
    if (await devolver()) {
      onCambio();
    }
  }

  return (
    <ModalBase titulo={`Asignación — ${empresa.razonSocial}`} onSalir={onSalir}>
      <section aria-label="Historial de asignaciones" className="space-y-2">
        {status === 'error' && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error ?? 'Error al cargar el historial'}
          </p>
        )}
        {status === 'loading' && (
          <p className="text-sm text-slate-500">Cargando historial…</p>
        )}
        {status === 'ready' && asignaciones.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-sm text-slate-500">
            Sin asignaciones registradas.
          </p>
        )}
        {status === 'ready' && asignaciones.length > 0 && (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {asignaciones.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {ETIQUETA_ACCION_ASIGNACION[a.accion]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatearFecha(a.createdAt)} · {a.actorUsuario}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {a.accion === 'ASIGNADO' ? 'Pool' : (a.responsablePrevio ?? 'Pool')} →{' '}
                  {a.responsableNuevo ?? 'Pool'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accionError !== null && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {accionError}
        </div>
      )}

      {esAdmin ? (
        <form onSubmit={enviarAsignacion} className="mt-4 space-y-2">
          <label htmlFor="responsable-asignacion" className="block text-sm font-medium text-slate-700">
            Responsable
          </label>
          <input
            id="responsable-asignacion"
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Usuario asignado (vacío no envía)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={accionEnCurso || responsable.trim() === ''}
            className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {empresa.responsable === null ? 'Asignar' : 'Reasignar'}
          </button>
        </form>
      ) : (
        empresa.responsable !== null && (
          <button
            type="button"
            onClick={devolverAlPool}
            disabled={accionEnCurso}
            className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Devolver al pool
          </button>
        )
      )}
    </ModalBase>
  );
}
