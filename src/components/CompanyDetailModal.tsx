import React from 'react';
import { X, FileDown, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { CompanyGroup } from '@/utils/valoracionesCore';
import { formatNumber } from '@/utils/excelParser';

interface CompanyDetailModalProps {
  company: CompanyGroup;
  onClose: () => void;
  onDownloadCompany: (companyName: string) => void;
  downloadError?: string | null;
}

export default function CompanyDetailModal({
  company,
  onClose,
  onDownloadCompany,
  downloadError,
}: CompanyDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
              Detalle de Valoraciones
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {company.company}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Download Error Banner */}
          {downloadError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Subtotal
              </span>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                S/ {formatNumber(company.subtotal)}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                IGV 18%
              </span>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                S/ {formatNumber(company.igv)}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-center">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Total
              </span>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                S/ {formatNumber(company.total)}
              </p>
            </div>
          </div>

          {/* Rows Table */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Valoraciones</span>
              <span className="text-xs font-normal text-slate-400">
                ({company.rows.length} registro
                {company.rows.length !== 1 ? 's' : ''})
              </span>
            </h3>

            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/30 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Examen</th>
                    <th className="px-4 py-3">Perfil</th>
                    <th className="px-4 py-3 text-right">Costo (S/.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {company.rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-200">
                        {row.nombre}
                      </td>
                      <td className="px-4 py-3.5 font-mono">{row.dociden}</td>
                      <td className="px-4 py-3.5">{row.tipo_examen}</td>
                      <td className="px-4 py-3.5 max-w-xs truncate">
                        {row.perfil}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold">
                        S/ {formatNumber(row.costo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            Cerrar
          </button>

          <button
            onClick={() => onDownloadCompany(company.company)}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:scale-[1.03] transition-all duration-300"
          >
            <FileDown className="w-4 h-4" />
            <span>Descargar Excel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
