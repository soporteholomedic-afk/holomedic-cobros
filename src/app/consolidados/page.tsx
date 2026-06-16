'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { CompanySelector } from '@/features/envio-resultados/presentation/components/CompanySelector';

function ConsolidadosContent() {
  const router = useRouter();

  const handleCompanySelect = (companyName: string, fechaInicio: string, fechaFin: string) => {
    const params = new URLSearchParams({
      companyName,
      fechaInicio,
      fechaFin,
    });
    router.push(`/consolidados/envio-resultados?${params.toString()}`);
  };

  return <CompanySelector onSelect={handleCompanySelect} />;
}

export default function ConsolidadosPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Consolidados</h1>
          <p className="text-slate-500 mt-1">Seleccione una empresa</p>
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <ConsolidadosContent />
        </Suspense>
      </div>
    </main>
  );
}
