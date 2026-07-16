import { getAreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { ListTemplatesUseCase } from '@/features/plantillas-editor/application/listTemplates';
import type { AreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import type { Template } from '@/features/plantillas-editor/domain/entities';

/**
 * The data-loading core of `/admin/plantillas/[area]/page.tsx`.
 *
 * Extracted into a pure (testable) function so the page is a thin wrapper
 * that just calls `notFound()` or renders the editor. Server Components
 * are not directly renderable in `@testing-library/react`, so the page
 * cannot be tested as a component — but the resolver can.
 *
 * Returns one of:
 *  - `{ notFound: true }` — the area is unknown (caller calls `notFound()`).
 *  - `{ notFound: false, areaConfig, templates }` — the area is registered
 *    and the templates are loaded.
 *
 * The factory is async (it opens the HOLOMEDIC SQL Server pool and runs
 * the idempotent migrate). Database access is server-side only; the
 * returned `templates` are plain serializable `Template[]` safe to
 * cross the server→client boundary as props to `TemplateEditor`.
 *
 * Spec `area-template-config` / "Dynamic route resolution":
 *  - "Known area renders editor" — `areaConfig` is defined, `templates` is the
 *    active list (possibly empty for first-use).
 *  - "Unknown area returns 404" — `notFound: true` for any area not in
 *    `AREA_CONFIGS` (including reserved-but-unpopulated `cobranza` and
 *    `valoraciones`).
 */
export interface ResolvedArea {
  notFound: false;
  areaConfig: AreaConfig;
  templates: Template[];
}

export interface NotFoundResult {
  notFound: true;
}

export type ResolveResult = ResolvedArea | NotFoundResult;

export async function resolveAreaAndTemplates(area: string): Promise<ResolveResult> {
  const areaConfig = getAreaConfig(area);
  if (!areaConfig) {
    return { notFound: true };
  }
  const repo = await getTemplateDb();
  const useCase = new ListTemplatesUseCase(repo);
  const templates = await useCase.listActive(area);
  return { notFound: false, areaConfig, templates };
}
