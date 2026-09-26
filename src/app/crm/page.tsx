import { Suspense } from 'react';

import { getSession } from '@/lib/auth';
import { EmpresaList } from '@/features/crm/presentation/components/EmpresaList';

/**
 * `/crm` — empresa registry list (S1d/pr4, spec G1). Protected by
 * RUTAS_PROTEGIDAS via the proxy (permiso `crm`). Server Component
 * wrapper keeps the header outside the `<Suspense>` boundary the
 * client-side list needs (consolidados/historial-envios precedent).
 * The session is read ONCE here to derive `esAdmin` for the client
 * list (cartera/page.tsx precedent) — the POST behind the "Nueva
 * empresa" affordance is crm_admin-gated in-route and stays the real
 * security boundary.
 */
export default async function CrmPage() {
  const session = await getSession();
  const esAdmin = session?.permisos.includes('crm_admin') ?? false;

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
        <EmpresaList esAdmin={esAdmin} />
      </Suspense>
    </main>
  );
}
