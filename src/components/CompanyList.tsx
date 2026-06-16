import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Download, X, Clock } from 'lucide-react';
import { CompanyGroup } from '@/utils/valoraciones';
import { formatNumber } from '@/utils/excelParser';
import { useSearchHistory } from './hooks/useSearchHistory';

interface CompanyListProps {
  companies: CompanyGroup[];
  onSelectCompany: (company: CompanyGroup) => void;
  onDownloadAll: () => void;
}

const HISTORY_SCOPE = 'company-list';

export default function CompanyList({
  companies,
  onSelectCompany,
  onDownloadAll,
}: CompanyListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const itemsPerPage = 10;

  const { history, addTerm, removeTerm, clear } =
    useSearchHistory(HISTORY_SCOPE);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        searchContainerRef.current &&
        target &&
        !searchContainerRef.current.contains(target)
      ) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isHistoryOpen]);

  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return companies;
    const term = searchTerm.trim().toLowerCase();
    return companies.filter((c) => c.company.toLowerCase().includes(term));
  }, [companies, searchTerm]);

  const [previousSearchTerm, setPreviousSearchTerm] = useState(searchTerm);
  if (searchTerm !== previousSearchTerm) {
    setPreviousSearchTerm(searchTerm);
    setUserPage(1);
  }
  const currentPage = userPage;

  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCompanies.slice(start, start + itemsPerPage);
  }, [filteredCompanies, currentPage]);

  const hasData = companies.length > 0;
  const hasFilteredData = filteredCompanies.length > 0;

  const commitSearch = () => {
    if (searchTerm.trim().length > 0) {
      addTerm(searchTerm);
    }
  };

  const handleHistoryPick = (term: string) => {
    setSearchTerm(term);
    setIsHistoryOpen(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in delay-100">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div ref={searchContainerRef} className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsHistoryOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitSearch();
                setIsHistoryOpen(false);
              } else if (e.key === 'Escape') {
                setIsHistoryOpen(false);
              }
            }}
            role="combobox"
            aria-label="Buscar empresa"
            aria-autocomplete="list"
            aria-expanded={isHistoryOpen && history.length > 0}
            aria-controls="company-search-history"
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100"
          />

          {isHistoryOpen && history.length > 0 && (
            <div
              id="company-search-history"
              role="listbox"
              aria-label="Búsquedas recientes"
              className="absolute z-20 left-0 right-0 mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg shadow-slate-200/40 dark:shadow-black/40 overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Búsquedas recientes
                </span>
                <button
                  type="button"
                  onClick={clear}
                  className="text-sky-600 dark:text-sky-400 hover:underline normal-case tracking-normal"
                >
                  Limpiar
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {history.map((term) => (
                  <li
                    key={term}
                    role="option"
                    aria-selected="false"
                    className="group flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleHistoryPick(term);
                    }}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{term}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Eliminar "${term}" del historial`}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTerm(term);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          onClick={onDownloadAll}
          disabled={!hasData}
          className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <Download className="w-4 h-4" />
          <span>Descargar todo</span>
        </button>
      </div>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-950/20">
              <th className="px-6 py-3.5">Empresa</th>
              <th className="px-6 py-3.5 text-right">Registros</th>
              <th className="px-6 py-3.5 text-right">Subtotal (S/.)</th>
              <th className="px-6 py-3.5 text-right">IGV 18%</th>
              <th className="px-6 py-3.5 text-right">Total (S/.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {hasFilteredData ? (
              paginatedCompanies.map((c) => (
                <tr
                  key={c.company}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-950/30 transition-colors group cursor-pointer"
                  onClick={() => onSelectCompany(c)}
                >
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                    {c.company}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {c.rows.length}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                    {formatNumber(c.subtotal)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                    {formatNumber(c.igv)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatNumber(c.total)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                >
                  {hasData
                    ? 'No se encontraron empresas que coincidan con la búsqueda.'
                    : 'No se encontraron empresas en el archivo.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div>
            Mostrando del {((currentPage - 1) * itemsPerPage) + 1} al{' '}
            {Math.min(
              currentPage * itemsPerPage,
              filteredCompanies.length,
            )}{' '}
            de {filteredCompanies.length} empresas
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                setUserPage((prev) => Math.max(prev - 1, 1))
              }
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-400">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() =>
                setUserPage((prev) =>
                  Math.min(prev + 1, totalPages),
                )
              }
              disabled={currentPage === totalPages}
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
