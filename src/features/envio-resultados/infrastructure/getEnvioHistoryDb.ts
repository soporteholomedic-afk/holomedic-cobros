import type { IEnvioHistoryRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { migrate } from './sqlserver/migrate';

let cached: Promise<IEnvioHistoryRepository> | null = null;

/**
 * Return the process-wide envio-history repository (a cached Promise),
 * mirroring the `getTemplateDb` factory:
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent `migrate()` so
 *      `dbo.envios_consolidados` exists on first connection.
 *   3. Wraps the pool in the SQL Server adapter.
 *
 * Every subsequent call returns the same cached promise so the
 * underlying pool + adapter are reused across requests.
 *
 * History is best-effort (design D4): callers wrap this in try/catch
 * so a history outage never blocks the send pipeline.
 */
export function getEnvioHistoryDb(): Promise<IEnvioHistoryRepository> {
  if (cached) return cached;
  cached = (async (): Promise<IEnvioHistoryRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    const { SqlServerEnvioHistoryRepository } = await import('./sqlserver/SqlServerEnvioHistoryRepository');
    return new SqlServerEnvioHistoryRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit
 * tests can inject a mock `IEnvioHistoryRepository` without opening a
 * real SQL Server connection. Pass `null` to clear so the next
 * `getEnvioHistoryDb()` call rebuilds a real adapter.
 */
export function __setEnvioHistoryDbForTests(repo: IEnvioHistoryRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
