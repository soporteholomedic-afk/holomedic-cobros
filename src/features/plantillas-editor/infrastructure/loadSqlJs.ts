/**
 * Lazily initialise the sql.js WASM runtime and cache the `SqlJsStatic`.
 *
 * The wasm bytes are loaded internally by sql.js itself (`sql-wasm.js` uses
 * `__dirname` + `sql-wasm.wasm` to resolve the binary at runtime), so we
 * don't pre-read the WASM file here. This also avoids Turbopack tracing a
 * `.wasm` file path (which triggers a virtual loader with Vite placeholders
 * that Turbopack can't resolve).
 *
 * The cache holds the resolved `SqlJsStatic` so subsequent calls are free.
 */
import type { SqlJsStatic } from 'sql.js';

let cachedPromise: Promise<SqlJsStatic> | null = null;

export async function loadSqlJs(): Promise<SqlJsStatic> {
  if (cachedPromise) return cachedPromise;
  const { default: initSqlJs } = await import('sql.js');
  cachedPromise = initSqlJs();
  return cachedPromise;
}
