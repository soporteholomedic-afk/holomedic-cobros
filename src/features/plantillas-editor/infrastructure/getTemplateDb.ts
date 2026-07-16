import type { ITemplateRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { SqlServerTemplateRepository, migrate } from './sqlserver';

let cached: Promise<ITemplateRepository> | null = null;

/**
 * Return the process-wide template repository (a cached Promise).
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent `migrate()` so the schema exists on first
 *      connection.
 *   3. Wraps the pool in `SqlServerTemplateRepository`.
 *
 * Every subsequent call returns the same cached promise so the
 * underlying pool + adapter are reused across requests.
 *
 * Mirrors the `getFileRepository` singleton + test-seam philosophy
 * (cached promise, async signature for uniform `await` at call sites).
 */
export function getTemplateDb(): Promise<ITemplateRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ITemplateRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerTemplateRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit tests
 * for the API routes and use cases can inject a mock
 * `ITemplateRepository` without ever opening a real SQL Server
 * connection. Pass `null` to clear so the next `getTemplateDb()` call
 * rebuilds a real adapter.
 */
export function __setTemplateDbForTests(repo: ITemplateRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
