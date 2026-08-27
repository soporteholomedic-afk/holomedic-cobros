'use client';

import { useState } from 'react';
import { Loader2, Search, Table2 } from 'lucide-react';

import type { EmpresaGrupo } from '../../domain/entities';
import type { ValoracionesStatus } from '../hooks/useValoraciones';
import { formatMonto } from '../helpers/format';

/**
 * Results table for the valoraciones query (REQ-03 Q-R6, detail mode):
 * rows grouped by facturar-a with moneda-aware subtotal/IGV/total. The
 * group's own `simbol` (from the SP row) labels the amounts, so a
 * DOLARES query renders `*MO` amounts with `$` — the codMon switch is
 * driven by the executed query (re-query on moneda change).
 */
export interface EmpresaListProps {
  grupos: EmpresaGrupo[];
  status: ValoracionesStatus;
  error: string | null;
  totalRegistros: number;
  onSelectEmpresa: (grupo: EmpresaGrupo) => void;
}

const ITEMS_PER_PAGE = 10;

export function EmpresaList({
  grupos,
  status,
  error,
  totalRegistros,
  onSelectEmpresa,
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {status === 'loading' && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
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
                  colSpan={5}
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
                  colSpan={5}
                  className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                >
                  <Table2 className="w-5 h-5 mx-auto mb-2 opacity-60" />
                  Ingrese los filtros y presione Consultar.
                </td>
              </tr>
            )}
            {status === 'ready' &&
              (visibles.length > 0 ? (
                visibles.map((grupo) => (
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
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
