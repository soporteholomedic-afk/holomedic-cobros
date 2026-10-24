import { getAreaConfig, resolveAreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import type { AreaConfig, CatalogAreaRow } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { listCatalogAreas as sharedListCatalogAreas } from '@/features/plantillas-editor/infrastructure/catalogAreas';
import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { ListTemplatesUseCase } from '@/features/plantillas-editor/application/listTemplates';
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
 *  - "Unknown area returns 404" — `notFound: true` for any area neither in
 *    `AREA_CONFIGS` nor in the active areas catalog.
 *
 * Spec `plantillas-area-usuario` (catalog-driven areas): besides the three
 * rich code configs, ANY active area of the `dbo.areas` catalog resolves to
 * a generic editor config matched by normalized slug ("Facturación" →
 * "facturacion"). Registry areas keep precedence and never query the
 * catalog; the catalog is only fetched when the registry misses.
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

/** Injectable seams — tests pass a stub `listCatalogAreas`; production uses the shared default. */
export interface ResolveDeps {
  /** Active/inactive area rows of `dbo.areas`. Defaults to `catalogAreas.listCatalogAreas`. */
  listCatalogAreas?: () => Promise<CatalogAreaRow[]>;
}

export async function resolveAreaAndTemplates(area: string, deps: ResolveDeps = {}): Promise<ResolveResult> {
  const listCatalogAreas = deps.listCatalogAreas ?? sharedListCatalogAreas;
  // Registry fast path first — rich configs never touch the catalog DB.
  const areaConfig = getAreaConfig(area) ?? resolveAreaConfig(area, await listCatalogAreas());
  if (!areaConfig) {
    return { notFound: true };
  }
  const repo = await getTemplateDb();
  const useCase = new ListTemplatesUseCase(repo);
  const templates = await useCase.listActive(areaConfig.area);
  return { notFound: false, areaConfig, templates };
}
