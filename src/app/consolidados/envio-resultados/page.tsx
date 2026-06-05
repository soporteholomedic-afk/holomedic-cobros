'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { PatientTable } from '@/features/envio-resultados/presentation/components/PatientTable';

function EnvioResultadosContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 text-lg">No se ha seleccionado una empresa</p>
        <Link
          href="/consolidados"
          className="inline-block mt-4 text-sky-600 hover:text-sky-700 underline"
        >
          Volver a seleccionar empresa
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left column — Patient selection */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Seleccionar pacientes</h2>
        <PatientTable
          companyId={companyId}
          onSelectionChange={(selected) => {
            // Will be used in PR #4 for sending
          }}
        />
      </div>

      {/* Right column — Email editor placeholder (PR #4) */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Editor de correo</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-400 text-lg">Editor de correo — próximo paso</p>
        </div>
      </div>
    </div>
  );
}

export default function EnvioResultadosPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/consolidados"
            className="text-sm text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-slate-800 mb-8">Envío de Resultados</h1>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <EnvioResultadosContent />
        </Suspense>
      </div>
    </main>
  );
}
