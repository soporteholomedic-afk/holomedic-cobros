import type { ICompanyContactRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { SqlServerContactRepository, migrate } from './sqlserver';

let cached: Promise<ICompanyContactRepository> | null = null;

/**
 * Return the process-wide contact directory repository (a cached
 * Promise).
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent `migrate()` so `dbo.EmpresaContactos`
 *      exists on first connection.
 *   3. Wraps the pool in `SqlServerContactRepository`.
 *
 * Every subsequent call returns the same cached promise so the
 * underlying pool + adapter are reused across requests.
 *
 * Mirrors the `getTemplateDb` singleton + test-seam philosophy
 * (cached promise, async signature for uniform `await` at call
 * sites).
 */
export function getContactDb(): Promise<ICompanyContactRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ICompanyContactRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerContactRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit
 * tests for the API route can inject a mock `ICompanyContactRepository`
 * without ever opening a real SQL Server connection. Pass `null` to
 * clear so the next `getContactDb()` call rebuilds a real adapter.
 */
export function __setContactDbForTests(repo: ICompanyContactRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
