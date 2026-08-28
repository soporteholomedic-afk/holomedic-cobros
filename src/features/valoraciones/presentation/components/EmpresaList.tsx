'use client';

import { useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2, Search, Send, Table2 } from 'lucide-react';

import type { EmpresaGrupo } from '../../domain/entities';
import type { ValoracionesStatus } from '../hooks/useValoraciones';
import { formatMonto } from '../helpers/format';

/**
 * Results table for the valoraciones query (REQ-03 Q-R6, detail mode):
 * rows grouped by facturar-a with moneda-aware subtotal/IGV/total. The
 * group's own `simbol` (from the SP row) labels the amounts, so a
 * DOLARES query renders `*MO` amounts with `$` — the codMon switch is
 * driven by the executed query (re-query on moneda change).
 *
 * U6: every row carries its own actions — Enviar, Excel and PDF — each
 * acting ONLY on that row's empresa (the page wires them to the
 * empresa-scoped export/send flows). Row click still opens the detail
 * modal; the action buttons stop propagation.
 */
export interface EmpresaListProps {
  grupos: EmpresaGrupo[];
  status: ValoracionesStatus;
  error: string | null;
  totalRegistros: number;
  onSelectEmpresa: (grupo: EmpresaGrupo) => void;
  /** U6 row action: open the email modal pre-scoped to this empresa. */
  onEnviarEmpresa: (grupo: EmpresaGrupo) => void;
  /** U6 row action: download the Formato 35 Excel for this empresa only. */
  onExportarExcelEmpresa: (grupo: EmpresaGrupo) => void;
  /** U6 row action: download the landscape PDF for this empresa only. */
  onExportarPdfEmpresa: (grupo: EmpresaGrupo) => void;
  /** Empresa whose Excel export is in flight (`null` = none); only that row disables/spins (U7). */
  empresaExcelEnCurso: string | null;
  /** Empresa whose PDF export is in flight (`null` = none); only that row disables/spins (U7). */
  empresaPdfEnCurso: string | null;
}

const ITEMS_PER_PAGE = 10;

export function EmpresaList({
  grupos,
  status,
  error,
  totalRegistros,
  onSelectEmpresa,
  onEnviarEmpresa,
  onExportarExcelEmpresa,
  onExportarPdfEmpresa,
  empresaExcelEnCurso,
  empresaPdfEnCurso,
}: EmpresaListProps) {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtrados = grupos.filter((grupo) =>
    grupo.empresa.toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const totalPaginas = Math.ceil(filtrados.length / ITEMS_PER_PAGE);
  const paginaActual = Math.min(pagina, Math.max(totalPaginas, 1));
  const visibles = filtrados.slice(
    (paginaActual - 1) * ITEMS_PER_PAGE,
    paginaActual * ITEMS_PER_PAGE,
  );

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in delay-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label="Buscar empresa"
            placeholder="Buscar empresa…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100"
          />
        </div>
        {status === 'ready' && (
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            {totalRegistros} registros · {grupos.length} empresas
          </p>
        )}
      </div>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-950/20">
              <th className="px-6 py-3.5">Empresa</th>
              <th className="px-6 py-3.5 text-right">Registros</th>
              <th className="px-6 py-3.5 text-right">Subtotal</th>
              <th className="px-6 py-3.5 text-right">IGV 18%</th>
              <th className="px-6 py-3.5 text-right">Total</th>
              <th className="px-6 py-3.5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {status === 'loading' && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <span className="inline-flex items-center gap-2 text-slate-400 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Consultando valorizaciones…
                  </span>
                </td>
              </tr>
            )}
            {status === 'error' && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-rose-500 font-medium"
                  role="alert"
                >
                  {error ?? 'Error al consultar las valorizaciones.'}
                </td>
              </tr>
            )}
            {status === 'idle' && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                >
                  <Table2 className="w-5 h-5 mx-auto mb-2 opacity-60" />
                  Ingrese los filtros y presione Consultar.
                </td>
              </tr>
            )}
            {status === 'ready' &&
              (visibles.length > 0 ? (
                visibles.map((grupo) => {
                  // U7: scope the loading state to the one row in flight.
                  const excelFila = empresaExcelEnCurso === grupo.empresa;
                  const pdfFila = empresaPdfEnCurso === grupo.empresa;
                  return (
                  <tr
                    key={grupo.empresa}
                    onClick={() => onSelectEmpresa(grupo)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-950/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                      {grupo.empresa}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {grupo.cantidad}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {grupo.simbol} {formatMonto(grupo.subtotal)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {grupo.simbol} {formatMonto(grupo.igv)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                      {grupo.simbol} {formatMonto(grupo.total)}
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className="flex items-center justify-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`Enviar documentos de ${grupo.empresa}`}
                          title="Enviar documentos de esta empresa"
                          onClick={() => onEnviarEmpresa(grupo)}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                        >
                          <Send className="w-4 h-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Descargar Excel de ${grupo.empresa}`}
                          title="Descargar Excel de esta empresa"
                          onClick={() => onExportarExcelEmpresa(grupo)}
                          disabled={excelFila}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {excelFila ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4" aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Descargar PDF de ${grupo.empresa}`}
                          title="Descargar PDF de esta empresa"
                          onClick={() => onExportarPdfEmpresa(grupo)}
                          disabled={pdfFila}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {pdfFila ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                          ) : (
                            <FileDown className="w-4 h-4" aria-hidden />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                  >
                    No se encontraron valorizaciones para los filtros
                    seleccionados.
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {status === 'ready' && totalPaginas > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div>
            Mostrando del {(paginaActual - 1) * ITEMS_PER_PAGE + 1} al{' '}
            {Math.min(paginaActual * ITEMS_PER_PAGE, filtrados.length)} de{' '}
            {filtrados.length} empresas
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setPagina((prev) => Math.max(prev - 1, 1))}
              disabled={paginaActual === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-400">
              {paginaActual} / {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((prev) => Math.min(prev + 1, totalPaginas))}
              disabled={paginaActual === totalPaginas}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
