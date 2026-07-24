'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldX, ArrowLeft } from 'lucide-react';

function DenegadoContent() {
  const params = useSearchParams();
  const permiso = params.get('permiso') ?? '—';
  const label = params.get('label') ?? '';
  const ruta = params.get('ruta') ?? '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-red-500 to-orange-600 shadow-xl shadow-red-500/20 mb-6">
          <ShieldX className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h1>
        <p className="text-slate-400 text-sm mb-8">
          No tenés el permiso necesario para acceder a esta sección.
        </p>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 text-left">
          {label && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Sección</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>
            </div>
          )}
          {ruta && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">Ruta</span>
              <span className="text-sm font-mono text-slate-600 dark:text-slate-400">{ruta}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500">Permiso requerido</span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
              {permiso}
            </span>
          </div>
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

export default function DenegadoPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DenegadoContent />
    </Suspense>
  );
}
