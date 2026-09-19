import { Suspense } from 'react';

import { EmpresaList } from '@/features/crm/presentation/components/EmpresaList';

/**
 * `/crm` — empresa registry list (S1d/pr4, spec G1). Protected by
 * RUTAS_PROTEGIDAS via the proxy (permiso `crm`). Server Component
 * wrapper keeps the header outside the `<Suspense>` boundary the
 * client-side list needs (consolidados/historial-envios precedent).
 */
export default function CrmPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de empresas, contactos y seguimiento comercial.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <EmpresaList />
      </Suspense>
    </main>
  );
}
