'use client';

import { useMemo, useState } from 'react';
import type { SpResultRow } from '@/types/sp-result';
import { useConsolidadosResults } from '../hooks/useConsolidadosResults';

export interface PatientsListProps {
  fechaInicio: string;
  fechaFin: string;
  onViewFiles: (row: SpResultRow) => void;
}

const EM_DASH = '\u2014';

function cellValue(value: string | undefined | null): string {
  return value && value.length > 0 ? value : EM_DASH;
}

/**
 * Flat table view of the `/api/consolidados/results` raw rows.
 *
 * - One `<tr>` per `SpResultRow` — no dedup by DNI (the SP returns
 *   multiple rows for the same patient when there are multiple
 *   examinations, e.g. PREOCUPACIONAL + ADICIONALES).
 * - Columns: DNI, Nombre, Empresa, Tipo de examen, Fecha, Aptitud, Acción.
 * - Sorted by `Pacien` ascending using `localeCompare`.
 * - Empty cells render the em-dash (U+2014), matching `PersonRow` in
 *   `WorkerDetailTable.tsx`.
 * - The "Ver Archivos" action at the end of each row delegates the
 *   navigation decision to the parent via `onViewFiles(row)`.
 * - The "Reintentar" button on error increments an internal nonce that
 *   re-triggers the underlying hook's fetch without changing the dates.
 *
 * Spec: R-PL-1..9.
 */
export function PatientsList({
  fechaInicio,
  fechaFin,
  onViewFiles,
}: PatientsListProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const { rows, loading, error } = useConsolidadosResults(
    fechaInicio,
    fechaFin,
    retryNonce,
  );

  // R-PL-4: sort by `Pacien` ascending with locale-aware comparison.
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.Pacien.localeCompare(b.Pacien)),
    [rows],
  );

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando pacientes...</p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg mb-4">{error}</p>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ---- Empty state ----
  if (sortedRows.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
        <p className="text-slate-500 text-base">
          No se encontraron pacientes para el rango de fechas seleccionado
        </p>
      </div>
    );
  }

  // ---- Data table ----
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 font-medium text-slate-600">DNI</th>
            <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
            <th className="px-4 py-3 font-medium text-slate-600">Empresa</th>
            <th className="px-4 py-3 font-medium text-slate-600">Tipo de Examen</th>
            <th className="px-4 py-3 font-medium text-slate-600">Fecha</th>
            <th className="px-4 py-3 font-medium text-slate-600">Aptitud</th>
            <th className="px-4 py-3 font-medium text-slate-600">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedRows.map((row, idx) => (
            <tr
              key={`${row.NroDId}-${row.FecAte}-${idx}`}
              className="hover:bg-slate-50"
            >
              <td className="px-4 py-3 text-slate-600">{cellValue(row.NroDId)}</td>
              <td className="px-4 py-3 text-slate-800">{cellValue(row.Pacien)}</td>
              <td className="px-4 py-3 text-slate-600">{cellValue(row.NomCom)}</td>
              <td className="px-4 py-3 text-slate-600">{cellValue(row.DesTCh)}</td>
              <td className="px-4 py-3 text-slate-600">{cellValue(row.FecAte)}</td>
              <td className="px-4 py-3 text-slate-600">{cellValue(row.Condic)}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onViewFiles(row)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
                >
                  Ver Archivos
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
