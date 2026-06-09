'use client';

import { useState, useEffect } from 'react';
import type { CompanyGroup, WorkerRow } from '@/types/sp-result';

interface WorkerDetailTableProps {
  companyName: string;
  fechaInicio: string;
  fechaFin: string;
}

export function WorkerDetailTable({ companyName, fechaInicio, fechaFin }: WorkerDetailTableProps) {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (fechaInicio) queryParams.set('fechaInicio', fechaInicio);
        if (fechaFin) queryParams.set('fechaFin', fechaFin);
        const res = await fetch(`/api/consolidados/results?${queryParams.toString()}`);
        if (!cancelled) {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          const companies = data.companies as CompanyGroup[];
          const company = companies.find((c) => c.companyName === companyName);
          setWorkers(company ? company.workers : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Error al cargar los trabajadores. Intente nuevamente.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [companyName, fechaInicio, fechaFin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando trabajadores...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">{error}</p>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">
          No se encontraron trabajadores para esta empresa
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-4">{companyName}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
              <th className="px-4 py-3 font-medium text-slate-600">Tipo de Examen</th>
              <th className="px-4 py-3 font-medium text-slate-600">Proyecto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workers.map((worker, index) => (
              <tr key={`${worker.nombre}-${worker.tipoExamen}-${index}`} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{worker.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{worker.tipoExamen}</td>
                <td className="px-4 py-3 text-slate-600">{worker.proyecto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
