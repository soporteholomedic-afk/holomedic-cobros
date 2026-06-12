'use client';

import { useState, useEffect } from 'react';
import type { CompanyGroup, WorkerRow, OrderRow } from '@/types/sp-result';

interface WorkerDetailTableProps {
  companyName: string;
  fechaInicio: string;
  fechaFin: string;
}

export function WorkerDetailTable({ companyName, fechaInicio, fechaFin }: WorkerDetailTableProps) {
  // ---- Worker state (existing) ----
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Patient state (PR 2) ----
  const [patients, setPatients] = useState<OrderRow[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);

  // ---- Worker fetch (existing, unchanged) ----
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

  // ---- Patient fetch (PR 2, independent) ----
  useEffect(() => {
    let cancelled = false;

    const loadPatients = async () => {
      setPatientsLoading(true);
      setPatientsError(null);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('companyName', companyName);
        if (fechaInicio) queryParams.set('fechaInicio', fechaInicio);
        if (fechaFin) queryParams.set('fechaFin', fechaFin);
        const res = await fetch(`/api/consolidados/results_by_companies?${queryParams.toString()}`);
        if (!cancelled) {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          setPatients(Array.isArray(data) ? (data as OrderRow[]) : []);
        }
      } catch (err) {
        if (!cancelled) {
          setPatientsError('Error al cargar los pacientes. Intente nuevamente.');
        }
      } finally {
        if (!cancelled) {
          setPatientsLoading(false);
        }
      }
    };

    loadPatients();

    return () => {
      cancelled = true;
    };
  }, [companyName, fechaInicio, fechaFin]);

  // ---- Render both sections independently ----

  return (
    <div>
      {/* ===== Worker Section ===== */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Cargando trabajadores...</p>
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">{error}</p>
        </div>
      ) : workers.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">
            No se encontraron trabajadores para esta empresa
          </p>
        </div>
      ) : (
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
      )}

      {/* ===== Patient Section ===== */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Datos de Pacientes</h3>

        {patientsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Cargando pacientes...</p>
            </div>
          </div>
        ) : patientsError ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-lg">{patientsError}</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 text-lg">
              No se encontraron pacientes para esta empresa
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Ficha</th>
                  <th className="px-4 py-3 font-medium text-slate-600">RUT Empresa</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Razón Social</th>
                  <th className="px-4 py-3 font-medium text-slate-600">DNI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((patient) => (
                  <tr key={patient.IdAten} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{patient.IdAten}</td>
                    <td className="px-4 py-3 text-slate-600">{patient.NroRuc}</td>
                    <td className="px-4 py-3 text-slate-600">{patient.NomCFa}</td>
                    <td className="px-4 py-3 text-slate-600">{patient.NroDId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
