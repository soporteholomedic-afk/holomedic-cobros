import type {
  ConfigCrmRepository,
  ICrmEmpresaRepository,
  ICrmOportunidadRepository,
  IAtencionesServicio,
} from '../domain/ports';
import { getHolomedicPool, getPool } from '@/lib/db';
import { SqlServerCrmEmpresaRepository, migrate } from './sqlserver';
import { SqlServerConfigRepository } from './sqlserver/sqlServerConfigRepository';
import { SqlServerCrmOportunidadRepository } from './sqlserver/sqlServerCrmOportunidadRepository';
import { SqlServerAtencionesRepository } from './sqlserver/sqlServerAtencionesRepository';

type CrmPool = Awaited<ReturnType<typeof getHolomedicPool>>;

let cachedEmpresa: Promise<ICrmEmpresaRepository> | null = null;
let cachedOportunidades: Promise<ICrmOportunidadRepository> | null = null;
let cachedPool: Promise<CrmPool> | null = null;
let cachedConfig: Promise<ConfigCrmRepository> | null = null;
let cachedAtenciones: Promise<IAtencionesServicio> | null = null;

/**
 * The HOLOMEDIC pool, connected and migrated ONCE per process, shared by
 * every CRM repository getter. A failed connection or migration (rolled
 * back as a whole) is not cached: the next request retries, so a transient
 * error does not leave the CRM down until a restart.
 */
function getPoolMigrado(): Promise<CrmPool> {
  if (!cachedPool) {
    const intento = (async (): Promise<CrmPool> => {
      const pool = await getHolomedicPool();
      await pool.connect();
      await migrate(pool);
      return pool;
    })();
    cachedPool = intento;
    intento.catch(() => {
      if (cachedPool === intento) cachedPool = null;
    });
  }
  return cachedPool;
}

/** Empresa repository (fichas, contacts, history, sectors) over HOLOMEDIC. */
export function getCrmDb(): Promise<ICrmEmpresaRepository> {
  if (cachedEmpresa) return cachedEmpresa;
  const intento = (async (): Promise<ICrmEmpresaRepository> => {
    const pool = await getPoolMigrado();
    return new SqlServerCrmEmpresaRepository(pool);
  })();
  cachedEmpresa = intento;
  intento.catch(() => {
    if (cachedEmpresa === intento) cachedEmpresa = null;
  });
  return cachedEmpresa;
}

/** Oportunidad repository (the board deals) over the SAME migrated pool. */
export function getCrmOportunidadesDb(): Promise<ICrmOportunidadRepository> {
  if (cachedOportunidades) return cachedOportunidades;
  const intento = (async (): Promise<ICrmOportunidadRepository> => {
    const pool = await getPoolMigrado();
    return new SqlServerCrmOportunidadRepository(pool);
  })();
  cachedOportunidades = intento;
  intento.catch(() => {
    if (cachedOportunidades === intento) cachedOportunidades = null;
  });
  return cachedOportunidades;
}

/**
 * Platform-configuration repository over the SAME migrated pool (E5·T2
 * port). Same cache semantics: a failed connection is not cached, so the
 * next request retries.
 */
export function getCrmConfigRepository(): Promise<ConfigCrmRepository> {
  if (cachedConfig) return cachedConfig;
  const intento = (async (): Promise<ConfigCrmRepository> => {
    const pool = await getPoolMigrado();
    return new SqlServerConfigRepository(pool);
  })();
  cachedConfig = intento;
  intento.catch(() => {
    if (cachedConfig === intento) cachedConfig = null;
  });
  return cachedConfig;
}

/**
 * Read-only SIGLA adapter for the "última atención" of a RUC (T3). Built
 * over the existing SIGLA pool (`getPool()`, DB_* env) — it never writes,
 * so the CRM migration does not apply to it and a pool failure surfaces at
 * query time (mapped to 503 by the route that uses it).
 */
export function getCrmAtenciones(): Promise<IAtencionesServicio> {
  if (cachedAtenciones) return cachedAtenciones;
  cachedAtenciones = Promise.resolve(new SqlServerAtencionesRepository(() => getPool()));
  return cachedAtenciones;
}

export function __setCrmDbForTests(repo: ICrmEmpresaRepository | null): void {
  cachedEmpresa = repo ? Promise.resolve(repo) : null;
  // The three getters share one migrated pool; reset it too so a later call
  // re-runs the whole (idempotent) boot instead of skipping the migration.
  if (repo === null) {
    cachedOportunidades = null;
    cachedPool = null;
  }
}

export function __setCrmOportunidadesDbForTests(repo: ICrmOportunidadRepository | null): void {
  cachedOportunidades = repo ? Promise.resolve(repo) : null;
}

export function __setCrmAtencionesForTests(repo: IAtencionesServicio | null): void {
  cachedAtenciones = repo ? Promise.resolve(repo) : null;
}
