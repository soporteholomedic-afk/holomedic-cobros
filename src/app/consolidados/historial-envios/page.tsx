'use client';

import { Suspense } from 'react';
import { HistoryList } from '@/features/envio-resultados/presentation/components/HistoryList';

/**
 * `/consolidados/historial-envios` (PR3). Mirrors `src/app/consolidados/
 * page.tsx`: a hook-free outer wrapper keeps the header outside the
 * `<Suspense>` boundary that `HistoryList` needs for `useSearchParams`.
 * Protection is inherited from the existing `/consolidados` entry in
 * `RUTAS_PROTEGIDAS` via `startsWith` (asserted in task 2.4 tests) —
 * no new permission. Wider container than `/consolidados` (max-w-6xl):
 * the history table carries 8 columns plus an expandable detail row.
 */
export default function HistorialEnviosPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Historial de Envíos</h1>
          <p className="text-slate-500 mt-1">
            Registro de todos los envíos consolidados enviados desde la plataforma
          </p>
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <HistoryList />
        </Suspense>
      </div>
    </main>
  );
}
