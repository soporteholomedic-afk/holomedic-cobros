'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CompanySelector } from '@/features/envio-resultados/presentation/components/CompanySelector';
import {
  ConsolidadosViewSwitch,
  type ConsolidadosView,
} from '@/features/envio-resultados/presentation/components/ConsolidadosViewSwitch';
import { PatientsList } from '@/features/envio-resultados/presentation/components/PatientsList';
import { getLocalDateString, parseDateParam } from '@/lib/dates';
import type { SpResultRow } from '@/types/sp-result';

function ConsolidadosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = getLocalDateString();
  const [fechaInicio, setFechaInicio] = useState(() =>
    parseDateParam(searchParams.get('fechaInicio'), today),
  );
  const [fechaFin, setFechaFin] = useState(() =>
    parseDateParam(searchParams.get('fechaFin'), today),
  );
  const [view, setView] = useState<ConsolidadosView>('pacientes');

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
    router.push(queryString ? `/consolidados?${queryString}` : '/consolidados');
  };

  const handleCompanySelect = (companyName: string) => {
    const params = new URLSearchParams({
      companyName,
      fechaInicio,
      fechaFin,
    });
    router.push(`/consolidados/envio-resultados?${params.toString()}`);
  };

  const handleViewFiles = (row: SpResultRow) => {
    const params = new URLSearchParams({
      companyName: row.NomCom,
      fechaInicio,
      fechaFin,
    });
    router.push(`/consolidados/envio-resultados?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Date filter — lifted to page so both views share dates */}
      <form
        onSubmit={handleFilter}
        className="flex flex-col sm:flex-row gap-4 items-end p-4 bg-white rounded-xl border border-slate-200 shadow-sm"
      >
        <div className="flex-1 w-full">
          <label
            htmlFor="fechaInicio"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
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
          <label
            htmlFor="fechaFin"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
          >
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
          disabled={isInvalidRange}
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all duration-200 cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 h-[38px] sm:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>

      {isInvalidRange && (
        <p role="alert" className="text-xs font-medium text-rose-600 -mt-4">
          La fecha de inicio no puede ser mayor a la fecha final.
        </p>
      )}

      <ConsolidadosViewSwitch activeView={view} onViewChange={setView} />

      {view === 'pacientes' ? (
        <PatientsList
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onViewFiles={handleViewFiles}
        />
      ) : (
        <CompanySelector
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          onSelect={handleCompanySelect}
        />
      )}
    </div>
  );
}

export default function ConsolidadosPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Consolidados</h1>
          <p className="text-slate-500 mt-1">
            Lista de pacientes o empresas según el rango de fechas seleccionado
          </p>
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <ConsolidadosContent />
        </Suspense>
      </div>
    </main>
  );
}
