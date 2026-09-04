/**
 * Browser-safe filename sanitization core (design D3).
 *
 * This module is the `node:*`-free subset of `sanitize-filename`:
 * both functions here are pure string transforms with zero Node
 * builtins, so client bundles can import them directly (e.g. the
 * envio-resultados validator and rename previews) while server-only
 * helpers stay in `sanitize-filename.ts` (which re-exports this core
 * for its 30+ existing consumers).
 *
 * Do NOT add `node:*` imports here — that is the point of the split.
 */

/**
 * Windows-illegal filename characters per `NTFS` rules: `<>:"/\|?*` plus
 * the C0 control range (`\x00..\x1f`). We replace with `_` so the
 * resulting string is always a valid filename component on every
 * supported filesystem.
 */
const ILLEGAL_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const WHITESPACE_RUN_RE = /\s+/g;

/**
 * Sanitize a single filename component (no path separators).
 *
 * - Replaces Windows-illegal characters with `_`.
 * - Collapses runs of whitespace to a single space.
 * - Trims leading and trailing whitespace.
 */
export function sanitizeComponent(value: string): string {
  return value.replace(ILLEGAL_RE, '_').replace(WHITESPACE_RUN_RE, ' ').trim();
}

/**
 * Compose a sanitized zip filename from `{nombre} - {dni} - {empresa}`
 * (the caller appends `.zip`).
 *
 * - Empty components are dropped together with their surrounding
 *   ` - ` separators, so the final value is always non-empty when at
 *   least one input is non-empty.
 * - Each component is run through `sanitizeComponent` so illegal
 *   characters and whitespace runs are normalized.
 */
export function sanitizeZipName(nombre: string, dni: string, empresa: string): string {
  const parts = [nombre, dni, empresa]
    .map(sanitizeComponent)
    .filter((p) => p.length > 0);
  return parts.join(' - ');
}
