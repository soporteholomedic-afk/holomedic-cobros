'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { CompanyGroup } from '@/types/sp-result';
import { useConsolidadosResults } from '../hooks/useConsolidadosResults';

function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export interface CompanySelectorProps {
  fechaInicio: string;
  fechaFin: string;
  codSed: string;
  onSelect: (companyName: string) => void;
}

/**
 * Grid of company cards for the `/consolidados` route (the "empresas"
 * tab of the view switch). Delegates the fetch to `useConsolidadosResults`
 * — the same hook the patients list uses, so a single endpoint call
 * powers both views.
 *
 * The date filter is owned by the parent page; this component receives
 * the current `fechaInicio` / `fechaFin` as props and renders only the
 * cards grid (and its loading / empty / error / retry states). The page
 * can trigger a re-fetch by changing the date props (URL push) or by
 * remounting this component with a new key.
 *
 * The local `retryNonce` is bumped on the "Reintentar" click to re-run
 * the hook with the same dates — useful after a network error.
 *
 * Spec: R-CE-1..2.
 */
export function CompanySelector({ fechaInicio, fechaFin, codSed, onSelect }: CompanySelectorProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const { companies, loading, error } = useConsolidadosResults(
    fechaInicio,
    fechaFin,
    codSed,
    retryNonce,
  );

  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return companies;
    const term = normalizeText(searchTerm.trim());
    return companies.filter((c) => normalizeText(c.companyName).includes(term));
  }, [companies, searchTerm]);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando empresas...</p>
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
  if (companies.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
        <p className="text-slate-500 text-base">
          No hay empresas disponibles para el rango de fechas seleccionado
        </p>
      </div>
    );
  }

  // ---- Cards grid ----
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar empresa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
        />
      </div>
      {filteredCompanies.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500 text-base">
            No se encontraron empresas que coincidan con&nbsp;&ldquo;{searchTerm}&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <button
              key={company.companyName}
              onClick={() => onSelect(company.companyName)}
              className="text-left p-6 rounded-xl border border-slate-200 bg-white hover:border-sky-300 hover:shadow-md hover:shadow-sky-100/50 transition-all duration-200 cursor-pointer"
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{company.companyName}</h3>
              <p className="text-sm text-sky-600">
                {company.workerCount} trabajador{company.workerCount !== 1 ? 'es' : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export so existing imports of `CompanyGroup` from this module's path keep working.
export type { CompanyGroup };
