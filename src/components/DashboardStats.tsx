import React from 'react';
import { Users, AlertCircle, CheckCircle2, Coins, Landmark } from 'lucide-react';
import { DashboardMetrics, ClienteGroup } from '../types';
import { calculateMetrics, formatNumber } from '../utils/excelParser';

interface DashboardStatsProps {
  data: ClienteGroup[];
}

export default function DashboardStats({ data }: DashboardStatsProps) {
  const metrics = calculateMetrics(data);

  // Format currency object to human readable text
  const renderCurrencyTotals = (totalsObj: Record<string, number>, label: string) => {
    const keys = Object.keys(totalsObj);
    if (keys.length === 0) return `${label} 0.00`;
    return keys.map(mon => `${mon} ${formatNumber(totalsObj[mon])}`).join(' / ');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 animate-fade-in">
      
      {/* Total Clients Card */}
      <div className="relative overflow-hidden rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-md hover:shadow-lg transition-shadow duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-bl-full" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Clientes</span>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white">{metrics.totalClientes}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Clientes analizados en el reporte</p>
      </div>

      {/* Debting Clients Card */}
      <div className="relative overflow-hidden rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-md hover:shadow-lg transition-shadow duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Clientes con Deuda</span>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-5 h-5 animate-pulse" />
          </div>
        </div>
        <h3 className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">{metrics.clientesDeudores}</h3>
        <p className="text-xs text-rose-500/80 dark:text-rose-400/70 mt-2 font-medium">
          Monto total: {renderCurrencyTotals(metrics.deudaTotalPorMoneda, 'Deuda')}
        </p>
      </div>

      {/* Credit Clients Card (Saldo a Favor) */}
      <div className="relative overflow-hidden rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-md hover:shadow-lg transition-shadow duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Saldo a Favor</span>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
        <h3 className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{metrics.clientesConSaldoFavor}</h3>
        <p className="text-xs text-emerald-500/80 dark:text-emerald-400/70 mt-2 font-medium">
          Monto total: {renderCurrencyTotals(metrics.saldoFavorTotalPorMoneda, 'Crédito')}
        </p>
      </div>

      {/* Clean Accounts Card (Al Día) */}
      <div className="relative overflow-hidden rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-md hover:shadow-lg transition-shadow duration-300">
        <div className="absolute top-0 right-0 w-24 h-24 bg-slate-500/5 rounded-bl-full" />
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Clientes Al Día</span>
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
            <Landmark className="w-5 h-5" />
          </div>
        </div>
        <h3 className="text-3xl font-extrabold text-slate-700 dark:text-slate-200">{metrics.clientesAlDia}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Cuentas conciliadas o sin deudas</p>
      </div>

    </div>
  );
}
