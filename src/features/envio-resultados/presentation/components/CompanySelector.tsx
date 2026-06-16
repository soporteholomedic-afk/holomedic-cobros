'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { CompanyGroup } from '@/types/sp-result';

interface CompanySelectorProps {
  onSelect: (companyName: string, fechaInicio: string, fechaFin: string) => void;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateParam = (value: string | null, fallback: string): string => {
  if (value === null) return fallback;
  return DATE_PATTERN.test(value) ? value : fallback;
};

export function CompanySelector({ onSelect }: CompanySelectorProps) {
  const today = getLocalDateString();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [fechaInicio, setFechaInicio] = useState(() =>
    parseDateParam(searchParams.get('fechaInicio'), today),
  );
  const [fechaFin, setFechaFin] = useState(() =>
    parseDateParam(searchParams.get('fechaFin'), today),
  );
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previousSearchParams, setPreviousSearchParams] = useState(searchParams);
  if (searchParams !== previousSearchParams) {
    setPreviousSearchParams(searchParams);
    setFechaInicio(parseDateParam(searchParams.get('fechaInicio'), today));
    setFechaFin(parseDateParam(searchParams.get('fechaFin'), today));
  }

  const fetchCompanies = useCallback(
    (start: string, end: string, signal?: AbortSignal) => {
      const queryParams = new URLSearchParams();
      if (start) queryParams.set('fechaInicio', start);
      if (end) queryParams.set('fechaFin', end);

      return fetch(`/api/consolidados/results?${queryParams.toString()}`, { signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { companies: CompanyGroup[] }) => {
          setCompanies(data.companies);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setError('Error al cargar las empresas. Intente nuevamente.');
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [],
  );

  const initialDatesRef = useRef<{ inicio: string; fin: string } | null>(
    null,
  );
  if (initialDatesRef.current === null) {
    initialDatesRef.current = { inicio: fechaInicio, fin: fechaFin };
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
    });
    const { inicio, fin } = initialDatesRef.current as {
      inicio: string;
      fin: string;
    };
    fetchCompanies(inicio, fin, controller.signal);
    return () => controller.abort();
  }, [fetchCompanies]);

  const isInvalidRange =
    fechaInicio.length > 0 &&
    fechaFin.length > 0 &&
    fechaInicio > fechaFin;

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidRange) return;
    const params = new URLSearchParams();
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
    setError(null);
    setLoading(true);
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
          disabled={loading || isInvalidRange}
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all duration-200 cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 h-[38px] sm:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>

      {isInvalidRange && (
        <p
          role="alert"
          className="text-xs font-medium text-rose-600 -mt-4"
        >
          La fecha de inicio no puede ser mayor a la fecha final.
        </p>
      )}

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
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchCompanies(fechaInicio, fechaFin);
            }}
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
              onClick={() => onSelect(company.companyName, fechaInicio, fechaFin)}
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
