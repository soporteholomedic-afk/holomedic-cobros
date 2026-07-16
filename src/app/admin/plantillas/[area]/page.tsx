import { notFound } from 'next/navigation';

import { TemplateEditor } from '@/features/plantillas-editor/presentation/components/TemplateEditor';
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
  const resolved = await resolveAreaAndTemplates(area);
  if (resolved.notFound) {
    notFound();
  }
  const { areaConfig, templates } = resolved;
  return <TemplateEditor areaConfig={areaConfig} templates={templates} />;
}
