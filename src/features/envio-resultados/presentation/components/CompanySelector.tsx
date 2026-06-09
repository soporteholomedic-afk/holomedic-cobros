'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CompanyGroup } from '@/types/sp-result';

interface CompanySelectorProps {
  onSelect: (companyName: string) => void;
}

export function CompanySelector({ onSelect }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/consolidados/results', { signal });
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
    fetchCompanies(controller.signal);
    return () => controller.abort();
  }, [fetchCompanies]);

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

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg mb-4">{error}</p>
        <button
          onClick={fetchCompanies}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">No hay empresas disponibles</p>
      </div>
    );
  }

  return (
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
  );
}
