import type { ConnectionPool } from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { migrate } from './sqlserver/migrate';

/**
 * The CRM feature container (ADR-3): one factory owning ONE pool and
 * ONE idempotent `migrate()`. pr2 exposes the migrated pool — the
 * `withCrmTransaction` input — as the single CRM DB entry point; later
 * slices add the SQL Server adapters here as the `SqlServer*Repository`
 * implementations land (empresa repo in pr3).
 *
 * Mirrors `getUsuarioDb`/`getAsistenciaDb`: lazy singleton, async
 * signature for uniform `await` at call sites.
 */
export interface CrmDb {
  /** Shared HOLOMEDIC pool, connected and schema-migrated. */
  pool: ConnectionPool;
}

let cached: Promise<CrmDb> | null = null;

/**
 * Return the process-wide CRM container (a cached Promise). The first
 * call opens the singleton `HOLOMEDIC` pool via `getHolomedicPool()`,
 * connects it and runs the idempotent `migrate()` so the schema exists
 * on first connection; every subsequent call returns the same promise.
 */
export function getCrmDb(): Promise<CrmDb> {
  if (cached) return cached;
  cached = (async (): Promise<CrmDb> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return { pool };
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached container so API-route
 * and use-case suites can inject a mock `CrmDb` without ever opening a
 * real SQL Server connection. Pass `null` to clear so the next
 * `getCrmDb()` call rebuilds the real container.
 */
export function __setCrmDbForTests(db: CrmDb | null): void {
  cached = db ? Promise.resolve(db) : null;
}
