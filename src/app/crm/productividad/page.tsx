import { Suspense } from 'react';

import { getSession } from '@/lib/auth';
import { ProductividadTable } from '@/features/crm/presentation/components/ProductividadTable';
import { periodoPorDefecto } from '@/features/crm/presentation/periodo';

/**
 * `/crm/productividad` — productivity view (tasks pr16/WU3, spec G6
 * "Productivity visibility"). Protected by RUTAS_PROTEGIDAS via the
 * proxy (permiso `crm`; the `/crm` prefix covers it — no new
 * registration needed). The Server Component reads the session ONCE
 * to phrase the subtitle and computes the default period (current
 * month to date) SERVER-SIDE — the client table receives both as
 * props, so the first fetch has no SSR/hydration drift. The own-vs-all
 * scope itself stays server-side in the API.
 */
export default async function ProductividadPage() {
  const session = await getSession();
  const esAdmin = session?.permisos.includes('crm_admin') ?? false;
  const periodoInicial = periodoPorDefecto(new Date());

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Productividad</h1>
        <p className="text-sm text-muted-foreground">
          {esAdmin
            ? 'Actividades y resultados de todos los usuarios en el período.'
            : 'Tus actividades y resultados en el período.'}
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ProductividadTable periodoInicial={periodoInicial} />
      </Suspense>
    </main>
  );
}
