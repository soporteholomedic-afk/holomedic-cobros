'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CompanyGroup } from '@/types/sp-result';

interface CompanySelectorProps {
  onSelect: (companyName: string) => void;
}

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function CompanySelector({ onSelect }: CompanySelectorProps) {
  const today = getLocalDateString();
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(today);

  const fetchCompanies = useCallback(async (start: string, end: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (start) queryParams.set('fechaInicio', start);
      if (end) queryParams.set('fechaFin', end);

      const res = await fetch(`/api/consolidados/results?${queryParams.toString()}`, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setCompanies(data.companies);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Error al cargar las empresas. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCompanies(today, today, controller.signal);
    return () => controller.abort();
  }, [fetchCompanies, today]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCompanies(fechaInicio, fechaFin);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Filtro de Fechas */}
      <form onSubmit={handleFilter} className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 w-full">
          <label htmlFor="fechaInicio" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Fecha Inicio
          </label>
          <input
            type="date"
            id="fechaInicio"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
        <div className="flex-1 w-full">
          <label htmlFor="fechaFin" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Fecha Fin
          </label>
          <input
            type="date"
            id="fechaFin"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all duration-200 cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 h-[38px] sm:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>

      {/* Listado de empresas */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Cargando empresas...</p>
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-4">{error}</p>
          <button
            type="button"
            onClick={() => fetchCompanies(fechaInicio, fechaFin)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500 text-base">No hay empresas disponibles para el rango de fechas seleccionado</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
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
