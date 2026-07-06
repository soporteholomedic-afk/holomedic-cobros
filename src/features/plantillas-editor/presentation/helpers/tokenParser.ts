import type { TokenAttrs } from '../../domain/entities';

/**
 * Regex matching the full `{{...}}` placeholder. The inner capture is
 * `[^}]+` (one or more non-`}` chars) so a `{{}}` (empty) placeholder does
 * NOT match and falls through to the `null` branch.
 *
 * Anchored with `^`/`$` because the input is a single placeholder string
 * (extracted by `extractPlaceholders`), not free text — we want to reject
 * `foo {{empresa}} bar` as not-a-placeholder here.
 */
const PLACEHOLDER_RE = /^\{\{([^}]+)\}\}$/;

/**
 * Parse a `{{token}}` Mustache placeholder string back into a `TokenAttrs`
 * chip. Returns `null` for any malformed input — the caller (the editor's
 * load pipeline) then leaves the text as-is rather than crashing.
 *
 * Accepted forms (design Decision c):
 *  - `{{empresa}}`                → { key: 'empresa' }
 *  - `{{tabla:docs:fecha,monto}}` → { key: 'tabla', table: 'docs', cols: ['fecha','monto'] }
 *  - `{{tabla:docs:}}`            → { key: 'tabla', table: 'docs', cols: [] }
 *
 * Rejected (→ `null`):
 *  - Missing opening/closing braces; empty `{{}}`; plain text with no braces.
 *  - A table form with the wrong number of colons (≠ 2) or an empty table
 *    name — `{{tabla:docs}}`, `{{tabla:docs:a:b}}`, `{{tabla::fecha}}`.
 *
 * Unknown keys (e.g. `{{doesNotExist}}`) STILL PARSE — validation of which
 * keys are real is the editor's job at INSERT time, not at parse time. This
 * lets an old stored template with a since-renamed token load as a chip
 * instead of crashing the editor.
 *
 * Pure: no side effects, no BlockNote dependency. Round-trip-tested with
 * `encodeToken` in task 3.5.
 */
export function parseTokenPlaceholder(placeholder: string): TokenAttrs | null {
  const match = PLACEHOLDER_RE.exec(placeholder);
  if (!match) return null;

  // Inner content is captured group 1. `[^}]+` guarantees it is non-empty.
  const inner = match[1] as string;

  const parts = inner.split(':');
  if (parts.length === 1) {
    // Simple form: {{key}}
    const key = parts[0] as string;
    if (key.length === 0) return null; // Defensive — regex already rejects empty.
    return { key };
  }

  if (parts.length === 3) {
    // Table form: {{key:table:cols}}
    const [key, table, colsRaw] = parts as [string, string, string];
    if (key.length === 0 || table.length === 0) return null;
    // Empty cols string → []. Non-empty → split on comma. Preserves order
    // and verbatim column names (no trim — round-trip must be exact).
    const cols = colsRaw.length === 0 ? [] : colsRaw.split(',');
    return { key, table, cols };
  }

  // 2 parts or 4+ parts → malformed (not a valid simple or table form).
  return null;
}
