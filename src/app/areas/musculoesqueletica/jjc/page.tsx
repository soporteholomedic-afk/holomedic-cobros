'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bone, Search } from 'lucide-react';
import { getLocalDateString } from '@/lib/dates';
import type { PacientePorEmpresaRow } from '@/types/sp-result';
import { DownloadCell } from '@/app/areas/medicina/jjc/DownloadCell';

const COMPANY_CODCLI = 149;

const EM_DASH = '\u2014';

function cellValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  const s = String(value);
  return s.length > 0 ? s : EM_DASH;
}

function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function usePacientes(codCli: number, fechaInicio: string, fechaFin: string) {
  const [rows, setRows] = useState<PacientePorEmpresaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({ company: String(codCli) });
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);

    // Defer setState to a microtask to conform with react-hooks/set-state-in-effect
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
    });

    fetch(`/api/areas/musculoesqueletica/pacientes?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        return res.json() as Promise<PacientePorEmpresaRow[]>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Error inesperado';
        if (!controller.signal.aborted) setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [codCli, fechaInicio, fechaFin, retryNonce]);

  return { rows, loading, error, refetch: () => setRetryNonce((n) => n + 1) };
}

export default function MusculoEsqueleticaJjcPage() {
  const today = getLocalDateString();
  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(today);
  const [appliedInicio, setAppliedInicio] = useState(today);
  const [appliedFin, setAppliedFin] = useState(today);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  const isInvalidRange = fechaInicio > fechaFin;

  const { rows, loading, error, refetch } = usePacientes(COMPANY_CODCLI, appliedInicio, appliedFin);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidRange) return;
    setAppliedInicio(fechaInicio);
    setAppliedFin(fechaFin);
  };

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = normalizeText(searchTerm.trim());
    return rows.filter(
      (r) =>
        normalizeText(r.paciente).includes(term) ||
        normalizeText(r.dni).includes(term) ||
        normalizeText(r.idAtencion).includes(term),
    );
  }, [rows, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400">
          <Bone className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            MusculoEsqueletica · JJC
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pacientes del área de MusculoEsqueletica — Empresa JJC CONTRATISTAS GENERALES S.A.
          </p>
        </div>
      </div>

      {/* Date filter */}
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
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all duration-200 cursor-pointer shadow-sm hover:shadow flex items-center justify-center gap-2 h-9.5 sm:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>
      {isInvalidRange && (
        <p role="alert" className="text-xs font-medium text-rose-600 -mt-4">
          La fecha de inicio no puede ser mayor a la fecha final.
        </p>
      )}

      {/* Search + table card */}
      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Search bar */}
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o idAtención..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
            />
          </div>
        </div>

        {/* Content area */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Cargando pacientes...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg mb-4">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate-500 text-base">
              No se encontraron pacientes para el rango de fechas seleccionado.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
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
                  <th className="px-4 py-3 font-medium text-slate-600">Id Atención</th>
                  <th className="px-4 py-3 font-medium text-slate-600">DNI</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Nombre</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Tipo Examen</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Fecha</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Puesto</th>
                  <th className="px-4 py-3 font-medium text-slate-600"><span className="sr-only">Acción</span></th>
                  <th className="px-4 py-3 font-medium text-slate-600">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.idAtencion}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {cellValue(row.idAtencion)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {cellValue(row.dni)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {cellValue(row.paciente)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cellValue(row.tipoExamen)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cellValue(row.fechaAtencion)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cellValue(row.puesto)}
                    </td>
                    <td className="px-4 py-3">
                      {row.idAtencion ? (
                        row.hasEvaluacion ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/areas/musculoesqueletica/jjc/${row.idAtencion}`)}
                            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium transition-colors cursor-pointer"
                          >
                            <span className="group-hover:hidden">Hecho</span>
                            <span className="hidden group-hover:inline">Editar</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => router.push(`/areas/musculoesqueletica/jjc/${row.idAtencion}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-medium transition-colors cursor-pointer"
                          >
                            Seleccionar
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )
                      ) : (
                        <span className="text-slate-300 text-xs">{EM_DASH}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.idAtencion ? (
                        <DownloadCell
                          idAten={row.idAtencion}
                          paciente={row.paciente}
                          apiPath={`/api/areas/musculoesqueletica/jjc/${row.idAtencion}/pdf`}
                        />
                      ) : (
                        <span className="text-slate-300 text-xs">{EM_DASH}</span>
                      )}
                    </td>
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
