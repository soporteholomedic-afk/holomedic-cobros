import type { IFirmaRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { SqlServerFirmaRepository, migrate } from './sqlserver';

let cached: Promise<IFirmaRepository> | null = null;

/**
 * Return the process-wide signature repository (a cached Promise).
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent plantillas `migrate()` so the guest schema
 *      (`dbo.templates` / `dbo.template_versions`) exists on first
 *      connection — signature rows are guests in that schema, so the
 *      signature factory reuses the template store's migration.
 *   3. Wraps the pool in `SqlServerFirmaRepository`.
 *
 * Every subsequent call returns the same cached promise so the
 * underlying pool + adapter are reused across requests.
 *
 * Mirrors `getTemplateDb` (same pool, same cached-promise singleton +
 * test-seam philosophy).
 */
export function getFirmaDb(): Promise<IFirmaRepository> {
  if (cached) return cached;
  cached = (async (): Promise<IFirmaRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerFirmaRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit tests
 * for the API routes and use cases can inject a mock
 * `IFirmaRepository` without ever opening a real SQL Server
 * connection. Pass `null` to clear so the next `getFirmaDb()` call
 * rebuilds a real adapter.
 */
export function __setFirmaDbForTests(repo: IFirmaRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
