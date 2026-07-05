import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';

/**
 * Lazily initialise the sql.js WASM runtime and cache the `SqlJsStatic`.
 *
 * The wasm bytes are read from the installed `sql.js` package on the FIRST
 * call only (never at module load) — so the primary `better-sqlite3` path
 * never pays the wasm-read cost. The cache holds the resolved `SqlJsStatic`
 * so subsequent calls are free.
 *
 * `createRequire` is used (instead of `import.meta.resolve`) for broad
 * Node/Next ESM-CJS interop: it resolves `sql.js/dist/sql-wasm.wasm`
 * against the real on-disk package layout (pnpm's `.pnpm` store included).
 */
const require = createRequire(import.meta.url);

let cachedPromise: Promise<Awaited<ReturnType<typeof initSqlJs>>> | null = null;

export function loadSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (cachedPromise) return cachedPromise;
  const wasmBinary = readFileSync(
    require.resolve('sql.js/dist/sql-wasm.wasm'),
  );
  cachedPromise = initSqlJs({
    wasmBinary,
  } as Parameters<typeof initSqlJs>[0]);
  return cachedPromise;
}
