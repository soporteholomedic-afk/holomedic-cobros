import type { AreaConfig } from '../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../domain/entities';
import { encodeToken } from './tokenSerializer';

/**
 * Resolve the human label for a `TokenAttrs` chip from the area's
 * `areaConfig.availableTokens`.
 *
 * - Simple token (`{ key }`): the first `TokenDef` with the same `key`.
 * - Table token (`{ key: 'tabla', table }`): the `TokenDef` with
 *   `key: 'tabla'` AND `tableRef === table`.
 *
 * If no matching `TokenDef` is found (e.g. an old stored template with a
 * since-renamed token, or a `table` that no longer exists in the registry),
 * the chip falls back to the encoded `{{token}}` placeholder so the user
 * sees the token exists and can fix it — never an empty string, never a
 * crash. This matches the design's "unknown/malformed degrade gracefully"
 * mitigation (Decision c).
 *
 * Pure: no side effects. Shared by `SubjectTokenInput`, `TemplateEditor`,
 * and the BlockNote `token` inline-content spec render.
 */
export function resolveTokenLabel(
  attrs: TokenAttrs,
  areaConfig: AreaConfig,
): string {
  const isTable = typeof attrs.table === 'string' && attrs.table.length > 0;
  for (const category of areaConfig.availableTokens) {
    for (const def of category.tokens) {
      if (def.key !== attrs.key) continue;
      if (isTable) {
        if (def.isTable === true && def.tableRef === attrs.table) {
          return def.label;
        }
        // Wrong table for this key — keep scanning other categories.
        continue;
      }
      // Simple token — first def with matching key wins.
      return def.label;
    }
  }
  // Unknown — degrade to the raw placeholder so the user can see + fix it.
  return encodeToken(attrs);
}
