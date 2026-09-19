import type { ConnectionPool } from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { migrate } from './sqlserver/migrate';
import { SqlServerEmpresaRepository } from './sqlserver/sqlServerEmpresaRepository';
import { SqlServerCrmImportador } from './importar/importadorCrm';
import type { CrmEmpresaRepositoryPort, CrmImportadorPort } from '../domain/ports';

/**
 * The CRM feature container (ADR-3): one factory owning ONE pool and
 * ONE idempotent `migrate()`. pr3 adds the first SQL Server adapter —
 * the empresa registry repository — bound to the migrated pool;
 * later slices add the remaining `SqlServer*Repository` adapters here.
 *
 * Mirrors `getUsuarioDb`/`getAsistenciaDb`: lazy singleton, async
 * signature for uniform `await` at call sites.
 */
export interface CrmDb {
  /** Shared HOLOMEDIC pool, connected and schema-migrated. */
  pool: ConnectionPool;
  /** Empresa registry adapter (registro de empresas, spec G1). */
  empresas: CrmEmpresaRepositoryPort;
  /** Import execution adapter (spec G2, pr6). */
  importador: CrmImportadorPort;
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
    return { pool, empresas: new SqlServerEmpresaRepository(pool), importador: new SqlServerCrmImportador(pool) };
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
