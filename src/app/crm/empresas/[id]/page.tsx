import { Suspense } from 'react';

import { EmpresaDetalle } from '@/features/crm/presentation/components/EmpresaDetalle';

/**
 * `/crm/empresas/[id]` — empresa detail (tasks pr11/WU2, spec G1+G4).
 * Protected by RUTAS_PROTEGIDAS via the proxy (the `/crm` prefix entry
 * covers every subroute — permiso `crm`). Server Component wrapper
 * keeps the header outside the `<Suspense>` boundary the client-side
 * detail needs (the `/crm` list page precedent).
 */
export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  const idValido = Number.isInteger(id) && id > 0;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Detalle de empresa</h1>
        <p className="text-sm text-muted-foreground">
          Datos, pipeline e historial de seguimiento comercial.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" />
          </div>
        }
      >
        {idValido ? (
          <EmpresaDetalle id={id} />
        ) : (
          <p role="alert" className="text-sm text-red-700">
            La ruta debe incluir un id de empresa válido.
          </p>
        )}
      </Suspense>
    </main>
  );
}
