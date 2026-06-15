import * as path from 'node:path';

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

/**
 * Sanitize the `?filename=` query parameter for the download endpoint.
 *
 * Throws when the (URL-decoded) value contains `..`, `/`, or `\\` so
 * the route can return `400` instead of attempting a traversal. A safe
 * value is passed through `path.win32.basename` to strip any path the
 * caller tries to inject.
 */
export function sanitizeDownloadName(raw: string): string {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes('..') || decoded.includes('/') || decoded.includes('\\')) {
    throw new Error('filename inválido');
  }
  return path.win32.basename(decoded);
}

/**
 * Sanitize the `?path=` query parameter for the folder-aware routes
 * (`/api/files/list-folder`, `/api/files/preview`, `/api/files/download`
 * once the `?path=` extension lands in PR-B1).
 *
 * The folder path MUST allow forward slashes (`subfolder/inner`), so
 * `path.win32.basename` is NOT appropriate here. The two-layer defense
 * is what actually blocks traversal:
 *
 *   1. URL-decode and reject `..` (after decoding — so `%2E%2E` is
 *      also caught), leading `/`, or leading `\\`.
 *   2. The route's containment check (path.win32.resolve + asserts
 *      resolved path is under the patient root) is the second layer.
 *
 * The empty string is a valid value (the patient's root folder).
 */
export function sanitizeFolderPath(raw: string): string {
  if (raw === '') return '';
  const decoded = decodeURIComponent(raw);
  if (decoded.includes('..')) throw new Error('path inválido');
  if (decoded.startsWith('/') || decoded.startsWith('\\')) throw new Error('path inválido');
  return decoded;
}
