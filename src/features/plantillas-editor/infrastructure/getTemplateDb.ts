import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';
import { SQLITE_DB_PATH, TEMPLATE_DB_DRIVER } from '@/lib/platform';
import type { TemplateDbDriver } from '@/lib/platform';

import type { ITemplateRepository } from '../domain/ports';
import { BetterSqliteTemplateRepository } from './sqlite/betterSqliteTemplateRepository';
import { SqlJsTemplateRepository } from './sqlite/sqlJsTemplateRepository';
import { migrate } from './sqlite/migrate';
import { loadSqlJs } from './loadSqlJs';

/**
 * Resolve the active template-DB driver from the environment. Pure: takes an
 * optional env value (defaulting to `process.env.TEMPLATE_DB_DRIVER`) and
 * returns `'sql.js'` only for the literal `'sql.js'`; any other value
 * (including unset/garbage) falls back to the primary `'better-sqlite3'`.
 * Exported so the selection logic is testable without touching I/O.
 */
export function resolveTemplateDbDriver(
  env: string | undefined = process.env.TEMPLATE_DB_DRIVER,
): TemplateDbDriver {
  return env === 'sql.js' ? 'sql.js' : 'better-sqlite3';
}

let cached: Promise<ITemplateRepository> | null = null;

/**
 * Ensure the parent directory of a file-backed SQLite path exists. No-op for
 * `:memory:` (no directory to create).
 */
function ensureDirFor(dbPath: string): void {
  if (dbPath === ':memory:') return;
  const dir = dirname(dbPath);
  if (dir) mkdirSync(dir, { recursive: true });
}

/**
 * Build the primary `better-sqlite3` adapter over `SQLITE_DB_PATH`. Runs
 * `migrate()` so the schema exists on first connection. Synchronous (the
 * native addon opens the file synchronously).
 */
function buildBetterSqlite(): ITemplateRepository {
  ensureDirFor(SQLITE_DB_PATH);
  const db = new Database(SQLITE_DB_PATH);
  migrate(db);
  return new BetterSqliteTemplateRepository(db);
}

/**
 * Build the fallback `sql.js` (WASM) adapter over `SQLITE_DB_PATH`. Loads
 * any existing database file into the WASM instance (so data persists
 * across restarts), runs `migrate()`, and wires `persist` to flush
 * `db.export()` back to the file after every mutation. Async because
 * `initSqlJs` is async — which is why `getTemplateDb` is async.
 */
async function buildSqlJs(): Promise<ITemplateRepository> {
  ensureDirFor(SQLITE_DB_PATH);
  const SQL = await loadSqlJs();
  const data = existsSync(SQLITE_DB_PATH) ? readFileSync(SQLITE_DB_PATH) : undefined;
  const db = new SQL.Database(data ?? null);
  migrate(db);
  const persist = (): void => {
    writeFileSync(SQLITE_DB_PATH, Buffer.from(db.export()));
  };
  return new SqlJsTemplateRepository(db, persist);
}

/**
 * Return the process-wide template repository (a cached Promise). The first
 * call builds the adapter selected by `TEMPLATE_DB_DRIVER`
 * (`better-sqlite3` by default, `sql.js` fallback); every subsequent call
 * returns the same cached promise so the underlying DB handle is reused
 * across requests.
 *
 * Async (unlike the sync `getFileRepository`): the `sql.js` fallback needs
 * an async `initSqlJs`, and a single async signature keeps call sites
 * uniform regardless of driver. PR 2's use cases `await getTemplateDb()`.
 *
 * Mirrors the `getFileRepository` singleton + test-seam philosophy.
 */
export function getTemplateDb(): Promise<ITemplateRepository> {
  if (cached) return cached;
  const driver = resolveTemplateDbDriver(TEMPLATE_DB_DRIVER);
  cached =
    driver === 'sql.js'
      ? buildSqlJs()
      : Promise.resolve(buildBetterSqlite());
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit tests for
 * the API routes and use cases can inject a mock `ITemplateRepository`
 * without ever touching a real SQLite file. Pass `null` to clear so the
 * next `getTemplateDb()` call rebuilds a real adapter.
 */
export function __setTemplateDbForTests(
  repo: ITemplateRepository | null,
): void {
  cached = repo ? Promise.resolve(repo) : null;
}
