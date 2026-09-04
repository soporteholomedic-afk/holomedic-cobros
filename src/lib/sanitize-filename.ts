/**
 * Server-side filename sanitization helpers.
 *
 * The pure component/zip-name sanitizers live in the browser-safe
 * `sanitize-filename-core` (design D3 — zero `node:*` imports so the
 * envio-resultados validator can import them client-side). They are
 * re-exported here so the 30+ existing consumers keep their import
 * path unchanged. Only the `node:path`-dependent helpers remain
 * defined in this module.
 */
export { sanitizeComponent, sanitizeZipName } from './sanitize-filename-core';

import * as path from 'node:path';

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
