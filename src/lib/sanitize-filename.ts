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
