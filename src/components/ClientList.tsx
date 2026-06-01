import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, FileWarning, CheckCircle2, X } from 'lucide-react';
import { ClienteGroup } from '../types';
import { formatNumber } from '../utils/excelParser';

interface ClientListProps {
  clients: ClienteGroup[];
  onSelectClient: (client: ClienteGroup) => void;
}

type FilterStatus = 'all' | 'debtors' | 'credito' | 'credits' | 'clean';

export default function ClientList({ clients, onSelectClient }: ClientListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter and search logic
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch =
        c.clienteId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.razonSocial.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterStatus === 'all' ||
        (filterStatus === 'debtors' && c.tieneDeuda) ||
        (filterStatus === 'credito' && c.tieneCredito) ||
        (filterStatus === 'credits' && c.tieneSaldoFavor) ||
        (filterStatus === 'clean' && !c.tieneDeuda && !c.tieneCredito && !c.tieneSaldoFavor);

      return matchesSearch && matchesFilter;
    });
  }, [clients, searchTerm, filterStatus]);

  // Reset page when filter or search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClients.slice(start, start + itemsPerPage);
  }, [filteredClients, currentPage]);

  // Pre-calculate status counts for badges on tabs
  const tabCounts = useMemo(() => {
    return {
      all: clients.length,
      debtors: clients.filter(c => c.tieneDeuda).length,
      credito: clients.filter(c => c.tieneCredito).length,
      credits: clients.filter(c => c.tieneSaldoFavor).length,
      clean: clients.filter(c => !c.tieneDeuda && !c.tieneCredito && !c.tieneSaldoFavor).length
    };
  }, [clients]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in delay-100">

      {/* Search and Filters Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por RUC/DNI o Razón Social..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-950/80 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-xl transition-all ${filterStatus === 'all'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-300 shadow-sm border border-slate-200/10'
              : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            Todos ({tabCounts.all})
          </button>

          <button
            onClick={() => setFilterStatus('debtors')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all ${filterStatus === 'debtors'
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 shadow-sm border border-rose-200/10'
              : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Deudores ({tabCounts.debtors})</span>
          </button>

          <button
            onClick={() => setFilterStatus('credito')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all ${filterStatus === 'credito'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shadow-sm border border-amber-200/10'
              : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Crédito ({tabCounts.credito})</span>
          </button>

          <button
            onClick={() => setFilterStatus('credits')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all ${filterStatus === 'credits'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-200/10'
              : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Con Saldo a Favor ({tabCounts.credits})</span>
          </button>

          <button
            onClick={() => setFilterStatus('clean')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all ${filterStatus === 'clean'
              ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-sm border border-slate-200/10'
              : 'hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            <span>Al Día ({tabCounts.clean})</span>
          </button>
        </div>

      </div>

      {/* Clients Grid/Table */}
      <div className="overflow-x-auto -mx-6">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-950/20">
              <th className="px-6 py-3.5">Cliente (RUC/DNI)</th>
              <th className="px-6 py-3.5">Razón Social</th>
              <th className="px-6 py-3.5 text-right">Saldo Consolidado</th>
              <th className="px-6 py-3.5 text-center">Estado</th>
              <th className="px-6 py-3.5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {paginatedClients.length > 0 ? (
              paginatedClients.map((c) => (
                <tr
                  key={c.clienteId}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-950/30 transition-colors group cursor-pointer"
                  onClick={() => onSelectClient(c)}
                >
                  <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                    {c.clienteId}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                    {c.razonSocial}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">
                    {Object.keys(c.saldosPorMoneda).map(mon => {
                      const val = c.saldosPorMoneda[mon].saldo;
                      return (
                        <div key={mon} className={val > 0 ? 'text-rose-600 dark:text-rose-400' : val < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}>
                          {mon} {formatNumber(Math.abs(val))}
                        </div>
                      );
                    })}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-2">
                      {c.facturasCredito > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/30"
                          title={`${c.facturasCredito} factura(s) a crédito (no vencidas)`}
                        >
                          <FileWarning size={16}></FileWarning>
                          <span>{c.facturasCredito}</span>
                        </span>
                      )}
                      {c.facturasAFavor > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/30"
                          title={`${c.facturasAFavor} factura(s) a favor`}
                        >
                          <CheckCircle2 size={16} />
                          <span>{c.facturasAFavor}</span>
                        </span>
                      )}
                      {c.facturasVencidas > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/30"
                          title={`${c.facturasVencidas} factura(s) vencida(s)`}
                        >
                          <X size={16} />
                          <span>{c.facturasVencidas}</span>
                        </span>
                      )}
                      {c.facturasCredito === 0 && c.facturasAFavor === 0 && c.facturasVencidas === 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/50"
                          title="Al día"
                        >
                          <span>✔️</span>
                          <span>Al día</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelectClient(c)}
                      className="inline-flex items-center justify-center space-x-1 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-500 hover:text-white dark:hover:bg-sky-500 transition-all duration-300 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/30 group-hover:scale-[1.03]"
                    >
                      <span>Ver Detalle</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                  No se encontraron clientes que coincidan con la búsqueda o el filtro.
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
            Mostrando del {((currentPage - 1) * itemsPerPage) + 1} al {Math.min(currentPage * itemsPerPage, filteredClients.length)} de {filteredClients.length} clientes
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-7 h-7 rounded-lg border transition-all ${currentPage === i + 1
                  ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev + 1, totalPages))}
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
