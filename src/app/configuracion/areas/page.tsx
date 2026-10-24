import { Layers } from 'lucide-react';

/**
 * ÁREAS tab of `/configuracion` (feature `configuracion-tabs`, S3:
 * "AREAS (VISTA VACÍA)") — an intentional EMPTY view: the areas CRUD
 * is not built yet. This placeholder reserves the tab and the route
 * (gated by the proxy on the `admin` permiso) so the section structure
 * ships before the feature does.
 */
export default function ConfiguracionAreasPage() {
  return (
    <div className="p-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-300">
            <Layers className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Áreas
          </h1>
          <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            La gestión de áreas todavía no está disponible. Próximamente vas a
            poder administrar las áreas de la organización desde esta vista.
          </p>
        </div>
      </div>
    </div>
  );
}
