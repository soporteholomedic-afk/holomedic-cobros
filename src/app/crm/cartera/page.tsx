import { Suspense } from 'react';

import { getSession } from '@/lib/auth';
import { CarteraTable } from '@/features/crm/presentation/components/CarteraTable';

/**
 * `/crm/cartera` — "Mi cartera" (tasks pr15/WU2, spec G5 "Cartera
 * views"). Protected by RUTAS_PROTEGIDAS via the proxy (permiso `crm`,
 * the `/crm` prefix covers it — no new registration needed). The
 * Server Component reads the session ONCE to derive `esAdmin` for the
 * client table (server-side session read, resolveFirmaPageData
 * precedent) — the SCOPING itself stays server-side in the API, so the
 * prop only drives the admin toggle/panel affordances.
 */
export default async function CarteraPage() {
  const session = await getSession();
  const esAdmin = session?.permisos.includes('crm_admin') ?? false;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Mi cartera</h1>
        <p className="text-sm text-muted-foreground">
          Las empresas asignadas a tu usuario y su próxima acción de seguimiento.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <CarteraTable esAdmin={esAdmin} />
      </Suspense>
    </main>
  );
}
