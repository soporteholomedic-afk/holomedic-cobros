import { notFound } from 'next/navigation';

import { TemplateEditor } from '@/features/plantillas-editor/presentation/components/TemplateEditor';
import { getSession } from '@/lib/auth';
import { resolveAreaAndTemplates } from './resolveAreaAndTemplates';

/**
 * The dynamic editor page for an area — the entry point of the
 * plantillas-editor feature (Server Component).
 *
 * Spec `area-template-config` / "Dynamic route resolution":
 *  - "Known area renders editor": GIVEN `/admin/plantillas/consolidados`,
 *    the editor is rendered with the consolidados `areaConfig` and
 *    initial templates.
 *  - "Unknown area returns 404": GIVEN `/admin/plantillas/unknown`,
 *    `notFound()` is invoked and a 404 response is returned.
 *
 * Server Component responsibilities (design SSR/client boundary):
 *  1. Resolve the area from the dynamic segment (`params.area`).
 *  2. Look up the `AreaConfig` — if undefined, `notFound()` (404).
 *  3. `await getTemplateDb()` to get the repo, then list the area's
 *     active templates via `ListTemplatesUseCase.listActive(area)`.
 *  4. Pass `{ areaConfig, templates }` to the Client `TemplateEditor`.
 *
 * The data-loading logic is extracted into `resolveAreaAndTemplates` so it
 * is testable independently (Server Components don't render in
 * `@testing-library/react` — the page is a thin wrapper). The factory is
 * async (it opens the HOLOMEDIC SQL Server pool and runs the
 * idempotent migrate), so the page must `await getTemplateDb()`. SQL
 * Server access is server-side only; the client receives plain
 * serializable `Template[]` props, not the repo.
 *
 * Default export: Next.js App Router convention for page files.
 */
interface PageProps {
  params: Promise<{ area: string }>;
}

export default async function PlantillasAreaPage({ params }: PageProps) {
  const { area } = await params;
  // plantillas-area-usuario L2: a user WITHOUT an assigned area is BLOCKED
  // from the editor — the sidebar renders a disabled entry and any direct
  // URL lands here. Checked before any DB work. A missing session cannot
  // normally reach this page (the proxy gates /admin/plantillas), but the
  // same screen applies.
  const session = await getSession();
  if (!session?.area) {
    return <SinAreaAsignada />;
  }
  const resolved = await resolveAreaAndTemplates(area);
  if (resolved.notFound) {
    notFound();
  }
  const { areaConfig, templates } = resolved;
  return <TemplateEditor areaConfig={areaConfig} templates={templates} />;
}

/**
 * Blocked screen for a session without `area` (plantillas-area-usuario
 * L2). Presentational on purpose: the actionable fix is administrative
 * (assign an area in Configuración → Usuarios), not a permission change.
 */
function SinAreaAsignada() {
  return (
    <div className="flex items-center justify-center p-10">
      <div className="max-w-md rounded-2xl border border-amber-300/50 bg-amber-50 p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-amber-900">Sin área asignada</h1>
        <p className="mt-2 text-sm text-amber-800">
          Tu usuario no tiene un área asignada, así que no podés acceder a las plantillas.
        </p>
        <p className="mt-3 text-sm text-amber-700">
          Pedile a un administrador que te asigne un área en Configuración → Usuarios.
        </p>
      </div>
    </div>
  );
}
