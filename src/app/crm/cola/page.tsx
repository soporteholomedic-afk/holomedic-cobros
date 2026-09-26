import { Suspense } from 'react';

import { ColaHoy } from '@/features/crm/presentation/components/ColaHoy';

/**
 * `/crm/cola` — "a quién le toca hoy" (tasks pr13/WU3, spec G4).
 * Protected by RUTAS_PROTEGIDAS via the proxy (permiso `crm`, the
 * `/crm` prefix covers it). Server Component wrapper keeps the header
 * outside the `<Suspense>` boundary the client-side queue needs
 * (`/crm` precedent). Derived on request — zero background jobs, no
 * auto-send: the page only shows who is due and links to each detail.
 */
export default function ColaPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Cola de hoy</h1>
        <p className="text-sm text-muted-foreground">
          A quién le toca hoy: seguimientos vencidos, reinicios de cadencia, decisiones pendientes y
          reactivables.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        <ColaHoy />
      </Suspense>
    </main>
  );
}
