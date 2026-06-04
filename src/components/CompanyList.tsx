import React, { useState, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import { CompanyGroup } from '@/utils/valoraciones';
import { formatNumber } from '@/utils/excelParser';

interface CompanyListProps {
  companies: CompanyGroup[];
  onSelectCompany: (company: CompanyGroup) => void;
  onDownloadAll: () => void;
}

export default function CompanyList({
  companies,
  onSelectCompany,
  onDownloadAll,
}: CompanyListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Client-side case-insensitive filter on company name
  const filteredCompanies = useMemo(() => {
    if (!searchTerm.trim()) return companies;
    const term = searchTerm.trim().toLowerCase();
    return companies.filter((c) => c.company.toLowerCase().includes(term));
  }, [companies, searchTerm]);

  // Reset pagination on search change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCompanies.slice(start, start + itemsPerPage);
  }, [filteredCompanies, currentPage]);

  const hasData = companies.length > 0;
  const hasFilteredData = filteredCompanies.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in delay-100">
      {/* Header: Search + Download All */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Descargar Todo Button */}
        <button
          onClick={onDownloadAll}
          disabled={!hasData}
          className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <Download className="w-4 h-4" />
          <span>Descargar todo</span>
        </button>
      </div>

      {/* Companies Table */}
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

      {/* Pagination Controls */}
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
                setCurrentPage((prev) => Math.max(prev - 1, 1))
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
                setCurrentPage((prev) =>
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
