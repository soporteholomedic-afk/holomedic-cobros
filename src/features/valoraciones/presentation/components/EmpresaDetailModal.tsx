'use client';

import { useEffect } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';

import { ventaPorMoneda } from '../../domain/agrupacion';
import type { CodigoMoneda, EmpresaGrupo } from '../../domain/entities';
import { formatFechaDisplay, formatMonto } from '../helpers/format';

/**
 * Detail modal for one empresa group (REQ-03 Q-R6, detail mode): summary
 * cards (subtotal / 18% IGV / total with the group's symbol) and the
 * grouped atenciones with moneda-aware importes — `*MO` amounts when the
 * query ran with `CodMon = 2`. Closes on overlay click or Escape.
 */
export interface EmpresaDetailModalProps {
  grupo: EmpresaGrupo;
  codMon: CodigoMoneda;
  onClose: () => void;
}

export function EmpresaDetailModal({ grupo, codMon, onClose }: EmpresaDetailModalProps) {
  // Escape-to-close (overlay click is handled on the backdrop element).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${grupo.empresa}`}
    >
      <div
        className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
              Detalle de Valorizaciones
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {grupo.empresa}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Summary cards (moneda-aware) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Subtotal
              </span>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {grupo.simbol} {formatMonto(grupo.subtotal)}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                IGV 18%
              </span>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {grupo.simbol} {formatMonto(grupo.igv)}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-center">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Total
              </span>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {grupo.simbol} {formatMonto(grupo.total)}
              </p>
            </div>
          </div>

          {/* Grouped rows */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Atenciones</span>
              <span className="text-xs font-normal text-slate-400">
                ({grupo.rows.length} registro{grupo.rows.length !== 1 ? 's' : ''})
              </span>
            </h3>

            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/30 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Paciente</th>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Examen / Servicio</th>
                    <th className="px-4 py-3">Puesto</th>
                    <th className="px-4 py-3">Fecha atención</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {grupo.rows.map((row, idx) => (
                    <tr key={`${row.IdAten}-${row.ItemEx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-200">
                        {row.Pacien}
                      </td>
                      <td className="px-4 py-3.5 font-mono">{row.NroDId}</td>
                      <td className="px-4 py-3.5">{row.DesTCh}</td>
                      <td className="px-4 py-3.5 max-w-[12rem] truncate" title={row.DesPue}>
                        {row.DesPue}
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        {formatFechaDisplay(row.FecAte)}
                      </td>
                      <td className="px-4 py-3.5">{row.EstCob}</td>
                      <td className="px-4 py-3.5 text-right font-mono font-semibold">
                        {row.Simbol} {formatMonto(ventaPorMoneda(row, codMon))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
