'use client';

import { useState } from 'react';

import { ETIQUETA_EVENTO_RESULTADO } from '../etiquetas';
import { EVENTOS_RESULTADO, type TipoResultado } from '../../domain/maquinaEstados';
import type { Periodo } from '../periodo';
import { useExportarProductividad } from '../hooks/useExportarProductividad';
import { useProductividad } from '../hooks/useProductividad';

/**
 * ProductividadTable — the `/crm/productividad` body (tasks pr16/WU3,
 * spec G6 "Admin dashboard"). One row per user with actividades,
 * resultados and the zero-filled D4 event breakdown; the Desde/Hasta
 * selector re-fetches through `useProductividad`. The "Exportar
 * Excel" button (pr17/WU2) exports the CURRENT selector period; the
 * own-vs-all SCOPE is the server's decision — the component renders
 * whatever the API returns, so the same table serves both kinds of
 * session.
 */

/** Module-level: one array for every render (header + all rows). */
const COLUMNAS_EVENTO: TipoResultado[] = [...EVENTOS_RESULTADO];

export function ProductividadTable({ periodoInicial }: { periodoInicial: Periodo }) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const { filas, status, error, retry } = useProductividad(periodo.desde, periodo.hasta);
  const { exportar, exportando, error: errorExportacion } = useExportarProductividad();

  return (
    <section aria-label="Productividad" className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Desde
          <input
            type="date"
            aria-label="Desde"
            value={periodo.desde}
            onChange={(e) => setPeriodo((prev) => ({ ...prev, desde: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-sky-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-600">
          Hasta
          <input
            type="date"
            aria-label="Hasta"
            value={periodo.hasta}
            onChange={(e) => setPeriodo((prev) => ({ ...prev, hasta: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-sky-500"
          />
        </label>
        <button
          type="button"
          onClick={() => exportar(periodo)}
          disabled={exportando}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {errorExportacion && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {errorExportacion}
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error ?? 'Error al cargar la productividad'}</span>
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
          <span className="ml-3 text-sm text-slate-500">Cargando productividad…</span>
        </div>
      )}

      {status === 'ready' && filas.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Sin datos de productividad en el período seleccionado.
        </p>
      )}

      {status === 'ready' && filas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Usuario</th>
                <th scope="col" className="px-4 py-3">Actividades</th>
                <th scope="col" className="px-4 py-3">Resultados</th>
                {COLUMNAS_EVENTO.map((evento) => (
                  <th key={evento} scope="col" className="px-4 py-3">
                    {ETIQUETA_EVENTO_RESULTADO[evento]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((fila) => (
                <tr key={fila.usuario} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{fila.usuario}</td>
                  <td className="px-4 py-3 text-slate-600">{fila.actividades}</td>
                  <td className="px-4 py-3 text-slate-600">{fila.resultados}</td>
                  {COLUMNAS_EVENTO.map((evento) => (
                    <td key={evento} className="px-4 py-3 text-slate-600">
                      {fila.porEvento[evento]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
