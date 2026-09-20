'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { FilaCartera } from '../../application/listarCartera';
import { ETIQUETA_ETAPA } from '../etiquetas';
import { useCartera } from '../hooks/useCartera';
import { PanelAsignacion } from './PanelAsignacion';

/**
 * CarteraTable — the `/crm/cartera` body (tasks pr15/WU2, spec G5
 * "Cartera views"). Renders the session's cartera (columns: empresa,
 * RUC, tipo, etapa, responsable, próxima acción) and delegates
 * fetching to `useCartera`. Admins get the "Ver todas" toggle — the
 * SERVER keeps the scope honest (the echoed `todas` decides what the
 * rows actually contain), so the toggle only widens the request for
 * `crm_admin` sessions. Every row links to its detail page; the
 * "Asignación" action opens the per-empresa assignment panel
 * (asignar/reasignar for admins, devolver for the owner).
 */
export function CarteraTable({ esAdmin }: { esAdmin: boolean }) {
  const [verTodas, setVerTodas] = useState(false);
  const [seleccionada, setSeleccionada] = useState<FilaCartera | null>(null);
  const { filas, status, error, retry, refresh } = useCartera(verTodas);

  return (
    <section aria-label="Mi cartera" className="space-y-4">
      {esAdmin && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            role="checkbox"
            aria-label="Ver todas"
            checked={verTodas}
            onChange={(e) => setVerTodas(e.target.checked)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Ver todas
        </label>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error ?? 'Error al cargar la cartera'}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div role="status" className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Cargando cartera…</span>
        </div>
      )}

      {status === 'ready' && filas.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Sin empresas en la cartera.
        </p>
      )}

      {status === 'ready' && filas.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Empresa</th>
                <th scope="col" className="px-4 py-3">RUC</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Etapa</th>
                <th scope="col" className="px-4 py-3">Responsable</th>
                <th scope="col" className="px-4 py-3">Próxima acción</th>
                <th scope="col" className="px-4 py-3">Asignación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((fila) => (
                <tr key={fila.empresaId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link
                      href={`/crm/empresas/${fila.empresaId}`}
                      className="hover:text-sky-600 hover:underline"
                    >
                      {fila.razonSocial}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{fila.ruc}</td>
                  <td className="px-4 py-3">{fila.tipo}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {fila.etapa === null ? '—' : ETIQUETA_ETAPA[fila.etapa]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {fila.responsable ?? 'Sin asignar'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fila.proximaAccion}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-label={`Ver asignación de ${fila.razonSocial}`}
                      onClick={() => setSeleccionada(fila)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Asignación
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seleccionada !== null && (
        <PanelAsignacion
          empresa={seleccionada}
          esAdmin={esAdmin}
          onSalir={() => setSeleccionada(null)}
          onCambio={refresh}
        />
      )}
    </section>
  );
}
