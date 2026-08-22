import type { ICobranzaEnviosHistorialRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';

import { SqlServerCobranzaHistorialRepository, migrate } from './sqlserver';

let cached: Promise<ICobranzaEnviosHistorialRepository> | null = null;

/**
 * Return the process-wide cobranza historial repository (a cached
 * Promise).
 *
 * The first call:
 *   1. Opens the singleton `HOLOMEDIC` SQL Server pool via
 *      `getHolomedicPool()` (env vars: `HOLOMEDIC_DB_*`).
 *   2. Runs the idempotent `migrate()` so
 *      `dbo.CobranzaEnviosHistorial` exists on first connection (the
 *      same batch also guards `EmpresaContactos` — `IF NOT EXISTS`
 *      makes the double run harmless).
 *   3. Wraps the pool in `SqlServerCobranzaHistorialRepository`.
 *
 * Every subsequent call returns the same cached promise so the
 * underlying pool + adapter are reused across requests.
 *
 * Mirrors the `getContactDb` singleton + test-seam philosophy
 * byte-for-byte (cached promise, async signature for uniform `await`
 * at call sites).
 */
export function getCobranzaHistorialDb(): Promise<ICobranzaEnviosHistorialRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ICobranzaEnviosHistorialRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerCobranzaHistorialRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit
 * tests for the audit helper and the API routes can inject a mock
 * `ICobranzaEnviosHistorialRepository` without ever opening a real
 * SQL Server connection. Pass `null` to clear so the next
 * `getCobranzaHistorialDb()` call rebuilds a real adapter.
 */
export function __setCobranzaHistorialForTests(
  repo: ICobranzaEnviosHistorialRepository | null,
): void {
  cached = repo ? Promise.resolve(repo) : null;
}
