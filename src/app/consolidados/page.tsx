'use client';

import { useRouter } from 'next/navigation';
import { CompanySelector } from '@/features/envio-resultados/presentation/components/CompanySelector';

export default function ConsolidadosPage() {
  const router = useRouter();

  const handleCompanySelect = (companyId: string) => {
    router.push(`/consolidados/envio-resultados?companyId=${companyId}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Consolidados</h1>
          <p className="text-slate-500 mt-1">Seleccione una empresa</p>
        </div>
        <CompanySelector onSelect={handleCompanySelect} />
      </div>
    </main>
  );
}
