'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { WorkerDetailTable } from '@/features/envio-resultados/presentation/components/WorkerDetailTable';

function EnvioResultadosContent() {
  const searchParams = useSearchParams();
  const companyName = searchParams.get('companyName');
  const fechaInicio = searchParams.get('fechaInicio') ?? '';
  const fechaFin = searchParams.get('fechaFin') ?? '';

  const backUrl = `/consolidados?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`;

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href={backUrl}
            className="text-sm text-sky-600 hover:text-sky-700 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-slate-800 mb-8">Envío de Resultados</h1>

        {!companyName ? (
          <div className="text-center py-16 bg-white rounded-lg border border-slate-100 shadow-sm">
            <p className="text-slate-500 text-lg">No se ha seleccionado una empresa</p>
            <Link
              href={backUrl}
              className="inline-block mt-4 text-sky-600 hover:text-sky-700 underline"
            >
              Volver a seleccionar empresa
            </Link>
          </div>
        ) : (
          <WorkerDetailTable companyName={companyName} fechaInicio={fechaInicio} fechaFin={fechaFin} />
        )}
      </div>
    </main>
  );
}

export default function EnvioResultadosPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 py-12 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </main>
      }
    >
      <EnvioResultadosContent />
    </Suspense>
  );
}
