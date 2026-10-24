import { getAreaConfig, resolveAreaConfig } from './areaConfigRegistry';
import type { AreaConfig, CatalogAreaRow } from './areaConfigRegistry';
import { getAreaDb } from '@/features/areas/infrastructure/getAreaDb';

/**
 * Shared area resolution for the plantillas-editor server surfaces (the
 * `/admin/plantillas/[area]` page and the `/api/plantillas` routes).
 *
 * An area is valid when it has a rich code config (registry precedence:
 * consolidados/cobranza/valoraciones) OR when it matches — by normalized
 * slug — an ACTIVE row of the `dbo.areas` catalog (generic config,
 * plantillas-area-usuario). Registry hits never touch the catalog DB.
 *
 * `listCatalogAreas` reads through the areas feature repository
 * (`getAreaDb`), so tests can inject a stub via `__setAreaDbForTests`.
 */
export async function listCatalogAreas(): Promise<CatalogAreaRow[]> {
  const repo = await getAreaDb();
  const areas = await repo.list();
  return areas.map((area) => ({ nombre: area.nombre, activo: area.activo }));
}

/**
 * Resolve the editor `AreaConfig` for an area slug, or `undefined` when
 * the area is neither registered nor an active catalog area.
 */
export async function resolveEditorAreaConfig(area: string): Promise<AreaConfig | undefined> {
  const registered = getAreaConfig(area);
  if (registered) {
    return registered;
  }
  return resolveAreaConfig(area, await listCatalogAreas());
}
