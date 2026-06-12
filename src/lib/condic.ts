/**
 * Normalize SpResultRow.Condic to a display-safe string.
 *
 * Contract (per spec REQ-WT-3):
 * - `null | undefined | '' | any case-insensitive form of 'NULL'` (e.g. 'null', 'Null', 'NULL') → `''`
 * - whitespace-only → `''`
 * - otherwise → `value.trim()`
 *
 * This is the ONLY place in the codebase that should reason about the literal
 * `'NULL'` string. Callers receive a pre-normalized value and can render `''`
 * as em-dash without re-checking.
 *
 * @param value - Raw Condic value from SpResultRow (always `string | null | undefined`)
 * @returns Normalized string suitable for direct UI display
 */
export function normalizeCondic(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.toUpperCase() === 'NULL') return '';
  return trimmed;
}
