import type { ConnectionPool } from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { migrate } from './sqlserver/migrate';
import { SqlServerEmpresaRepository } from './sqlserver/sqlServerEmpresaRepository';
import { SqlServerPipelineRepository } from './sqlserver/sqlServerPipelineRepository';
import { SqlServerCrmImportador } from './importar/importadorCrm';
import type {
  CrmEmpresaRepositoryPort,
  CrmHandoffsRepositoryPort,
  CrmImportadorPort,
  CrmPipelineRepositoryPort,
  CrmResultadosRepositoryPort,
  CrmTransicionesRepositoryPort,
} from '../domain/ports';

/**
 * The CRM feature container (ADR-3): one factory owning ONE pool and
 * ONE idempotent `migrate()`. pr3 adds the first SQL Server adapter —
 * the empresa registry repository — bound to the migrated pool; pr10
 * adds the pipeline adapter, ONE class implementing the four pipeline
 * roles (the transition write is genuinely cross-table, design §2b).
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
  /** Pipeline state adapter (spec G4, pr10). */
  pipeline: CrmPipelineRepositoryPort;
  /** Transition audit adapter (spec G4: who/when/from/to). */
  transiciones: CrmTransicionesRepositoryPort;
  /** Result-event adapter (spec G6 productivity). */
  resultados: CrmResultadosRepositoryPort;
  /** Handoff record adapter (spec G4). */
  handoffs: CrmHandoffsRepositoryPort;
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
    const pipelines = new SqlServerPipelineRepository(pool);
    return {
      pool,
      empresas: new SqlServerEmpresaRepository(pool),
      importador: new SqlServerCrmImportador(pool),
      pipeline: pipelines,
      transiciones: pipelines,
      resultados: pipelines,
      handoffs: pipelines,
    };
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
