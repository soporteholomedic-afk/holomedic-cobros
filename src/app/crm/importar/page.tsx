import { Suspense } from 'react';

import { ImportWizard } from '@/features/crm/presentation/components/ImportWizard';

/**
 * `/crm/importar` — Excel import wizard (tasks pr8/WU3, spec G2/G3).
 * Protected by RUTAS_PROTEGIDAS via the proxy (permiso `crm_admin`,
 * registered in pr1). Server Component wrapper keeps the header
 * outside the `<Suspense>` boundary the client-side wizard needs
 * (`/crm` page precedent).
 */
export default function ImportarEmpresasPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Importar Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Cargue la plantilla Excel, revise la vista previa y confirme la importación.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ImportWizard />
      </Suspense>
    </main>
  );
}
