import React from 'react';
import { X, Mail, AlertTriangle, Calendar, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { ClienteGroup, Documento } from '../types';
import { formatNumber } from '../utils/excelParser';

interface ClientDetailModalProps {
  client: ClienteGroup;
  onClose: () => void;
  onOpenEmailComposer: (client: ClienteGroup) => void;
}

// Helper to parse date DD/MM/YYYY
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  } catch {
    return null;
  }
}

// Helper to check if date DD/MM/YYYY is in the past
function isPastDue(dateStr: string): boolean {
  const date = parseDate(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

// Calculate days difference (positive = future, negative = past)
function daysDiff(dateStr: string): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Get credit remaining days (min days until due among non-overdue docs with positive balance)
function getCreditDaysRemaining(docs: Documento[]): number | null {
  let min: number | null = null;
  for (const doc of docs) {
    if (doc.saldo > 0.01) {
      const diff = daysDiff(doc.fechaVen);
      if (diff !== null && diff >= 0) {
        if (min === null || diff < min) min = diff;
      }
    }
  }
  return min;
}

// Get max overdue days (max days past due among overdue docs with positive balance)
function getOverdueDays(docs: Documento[]): number | null {
  let max: number | null = null;
  for (const doc of docs) {
    if (doc.saldo > 0.01) {
      const diff = daysDiff(doc.fechaVen);
      if (diff !== null && diff < 0) {
        const overdue = Math.abs(diff);
        if (max === null || overdue > max) max = overdue;
      }
    }
  }
  return max;
}

export default function ClientDetailModal({ client, onClose, onOpenEmailComposer }: ClientDetailModalProps) {
  const creditDaysRemaining = getCreditDaysRemaining(client.documentos);
  const overdueDays = getOverdueDays(client.documentos);
  
  // Format document type code to full name
  const getDocTypeName = (code: string) => {
    const types: Record<string, string> = {
      'FA': 'Factura',
      'FE': 'Factura Electrónica',
      'BO': 'Boleta',
      'NC': 'Nota de Crédito',
      'ND': 'Nota de Débito'
    };
    return types[code.toUpperCase()] || code;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">Detalle del Cliente</span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {client.razonSocial}
            </h2>
            <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
              <span className="font-semibold">RUC/DNI:</span>
              <span>{client.clienteId}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Net Balance Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Estado de Cuentas Consolidado
              </span>
              <div className="flex flex-wrap items-baseline gap-x-4">
                {Object.keys(client.saldosPorMoneda).map(mon => {
                  const val = client.saldosPorMoneda[mon].saldo;
                  return (
                    <div key={mon} className="flex items-baseline space-x-1.5">
                      <span className="text-xs font-bold text-slate-400">{mon}</span>
                      <span className={`text-2xl font-black ${
                        val > 0.01 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : val < -0.01 
                            ? 'text-emerald-600 dark:text-emerald-400' 
                            : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {formatNumber(Math.abs(val))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className={`p-5 rounded-2xl flex flex-col items-center justify-center border text-center ${
              client.tieneDeuda
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400'
                : client.tieneCredito
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-400'
                  : client.tieneSaldoFavor
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400'
                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300'
            }`}>
              {client.tieneDeuda ? (
                <>
                  <AlertCircle className="w-8 h-8 mb-2 animate-bounce" />
                  <span className="text-sm font-bold uppercase tracking-wider">Cliente deudor</span>
                  {overdueDays !== null && (
                    <span className="text-lg font-black mt-1">{overdueDays} día{overdueDays !== 1 ? 's' : ''}</span>
                  )}
                  <span className="text-xs mt-1 opacity-80">
                    {overdueDays !== null ? 'vencido' : 'Requiere gestión de cobro'}
                  </span>
                </>
              ) : client.tieneCredito ? (
                <>
                  <Calendar className="w-8 h-8 mb-2" />
                  <span className="text-sm font-bold uppercase tracking-wider">Crédito vigente</span>
                  {creditDaysRemaining !== null && (
                    <span className="text-lg font-black mt-1">{creditDaysRemaining} día{creditDaysRemaining !== 1 ? 's' : ''}</span>
                  )}
                  <span className="text-xs mt-1 opacity-80">
                    {creditDaysRemaining !== null ? 'restante de crédito' : 'Deuda aún no vencida'}
                  </span>
                </>
              ) : client.tieneSaldoFavor ? (
                <>
                  <CheckCircle2 className="w-8 h-8 mb-2" />
                  <span className="text-sm font-bold uppercase tracking-wider">Saldo a favor</span>
                  <span className="text-xs mt-1 opacity-80">Crédito disponible para aplicar</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mb-2 text-slate-400 dark:text-slate-500" />
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cuenta al día</span>
                  <span className="text-xs mt-1 text-slate-400">No registra deudas ni excesos</span>
                </>
              )}
            </div>
          </div>

          {/* Documents Table */}
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-sky-500" />
              <span>Documentos en Cuenta Corriente</span>
            </h3>
            
            <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/30 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Serie - Número</th>
                    {client.documentos.some(d => d.cuenta) && <th className="px-4 py-3">Cuenta</th>}
                    <th className="px-4 py-3">Fec. Emisión</th>
                    <th className="px-4 py-3">Fec. Vencimiento</th>
                    <th className="px-4 py-3 text-right">Cargo (Debe)</th>
                    <th className="px-4 py-3 text-right">Abono (Haber)</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {client.documentos.map((doc, idx) => {
                    const expired = isPastDue(doc.fechaVen) && doc.saldo > 0.01;
                    return (
                      <tr 
                        key={idx}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors ${
                          expired ? 'bg-rose-50/10 dark:bg-rose-950/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-slate-200">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mr-1.5">
                            {doc.tipoDoc}
                          </span>
                          {getDocTypeName(doc.tipoDoc)}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-medium">
                          {doc.serie}-{doc.numero}
                        </td>
                        {client.documentos.some(d => d.cuenta) && (
                          <td className="px-4 py-3.5 font-mono text-slate-500">
                            {doc.cuenta || '-'}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-slate-500">
                          {doc.fechaDoc || '-'}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center space-x-1.5">
                            <span className={expired ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500'}>
                              {doc.fechaVen || 'S/V'}
                            </span>
                            {expired && (
                              <span className="inline-flex text-[9px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 px-1 py-0.2 rounded border border-rose-200/20">
                                VENCIDO
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          {doc.moneda} {formatNumber(doc.debe)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          {doc.moneda} {formatNumber(doc.haber)}
                        </td>
                        <td className={`px-4 py-3.5 text-right font-mono font-bold ${
                          doc.saldo > 0.01 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : doc.saldo < -0.01 
                              ? 'text-emerald-600 dark:text-emerald-400' 
                              : 'text-slate-500'
                        }`}>
                          {doc.moneda} {formatNumber(doc.saldo)}
                        </td>
                      </tr>
                    );
                  })}
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
          
          {(client.tieneDeuda || client.tieneCredito) && (
            <button
              onClick={() => onOpenEmailComposer(client)}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-sm font-bold text-white shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 hover:scale-[1.03] transition-all duration-300"
            >
              <Mail className="w-4 h-4" />
              <span>Enviar Correo de Cobro</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
