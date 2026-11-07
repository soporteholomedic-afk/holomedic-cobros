import type { ConfigCrmRepository, ICrmEmpresaRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { SqlServerCrmEmpresaRepository, migrate } from './sqlserver';
import { SqlServerConfigRepository } from './sqlserver/sqlServerConfigRepository';

let cached: Promise<ICrmEmpresaRepository> | null = null;
let cachedConfig: Promise<ConfigCrmRepository> | null = null;

/**
 * Repository over HOLOMEDIC, migrated once per process. A failed connection or
 * migration (rolled back as a whole) is not cached: the next request retries,
 * so a transient error does not leave the CRM down until a restart.
 */
export function getCrmDb(): Promise<ICrmEmpresaRepository> {
  if (cached) return cached;
  const intento = (async (): Promise<ICrmEmpresaRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerCrmEmpresaRepository(pool);
  })();
  cached = intento;
  intento.catch(() => {
    if (cached === intento) cached = null;
  });
  return intento;
}

export function __setCrmDbForTests(repo: ICrmEmpresaRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}

/**
 * Platform-configuration repository over the SAME HOLOMEDIC pool and the
 * same one-shot `migrate()` flow as `getCrmDb()` (E5·T2 port). Same cache
 * semantics: a failed connection is not cached, so the next request retries.
 */
export function getCrmConfigRepository(): Promise<ConfigCrmRepository> {
  if (cachedConfig) return cachedConfig;
  const intento = (async (): Promise<ConfigCrmRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerConfigRepository(pool);
  })();
  cachedConfig = intento;
  intento.catch(() => {
    if (cachedConfig === intento) cachedConfig = null;
  });
  return cachedConfig;
}
