'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SpResultRow } from '@/types/sp-result';
import { useConsolidadosResults } from '../hooks/useConsolidadosResults';

export interface PatientsListProps {
  fechaInicio: string;
  fechaFin: string;
  codSed: string;
  onViewFiles: (row: SpResultRow) => void;
}

const EM_DASH = '\u2014';

function cellValue(value: string | undefined | null): string {
  return value && value.length > 0 ? value : EM_DASH;
}

function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
  codSed,
  onViewFiles,
}: PatientsListProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const { rows, loading, error } = useConsolidadosResults(
    fechaInicio,
    fechaFin,
    codSed,
    retryNonce,
  );

  // R-PL-4: sort by `Pacien` ascending with locale-aware comparison.
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.Pacien.localeCompare(b.Pacien)),
    [rows],
  );

  const filteredRows = useMemo(
    () => {
      if (!searchTerm.trim()) return sortedRows;
      const term = normalizeText(searchTerm.trim());
      return sortedRows.filter(
        (row) =>
          normalizeText(row.NroDId).includes(term) ||
          normalizeText(row.Pacien).includes(term) ||
          normalizeText(row.NomCom).includes(term) ||
          normalizeText(row.DesTCh).includes(term) ||
          normalizeText(row.Condic).includes(term) ||
          normalizeText(row.DesDes).includes(term),
      );
    },
    [sortedRows, searchTerm],
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
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por DNI, nombre, empresa, tipo de examen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
      </div>
      {filteredRows.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-base">
            No se encontraron pacientes que coincidan con&nbsp;&ldquo;{searchTerm}&rdquo;
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
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
              {filteredRows.map((row, idx) => (
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
      )}
    </div>
  );
}
