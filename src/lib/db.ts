import mssql from 'mssql';

/**
 * Environment-variable prefix for a SQL Server connection. `DB_` is the
 * legacy prefix used by the SIGLA / ICCGSA queries (consumed by
 * `getPool()`); `HOLOMEDIC_DB_` is the new prefix for the template store
 * (consumed by `getHolomedicPool()`).
 *
 * Keeping the prefixes distinct lets ops point the two pools at different
 * SQL Server instances in the future, even though v1 shares the same
 * host/user/password and only differs by database name.
 */
export type DbEnvPrefix = 'DB_' | 'HOLOMEDIC_DB_';

/**
 * Build an `mssql.config` for a target database by reading host / port /
 * user / password from the requested env-var prefix. Throws a clear
 * error if any required variable is missing so the route can map the
 * failure to HTTP 500 with a meaningful message.
 *
 * The function does NOT cache the result — `getPool()` / `getHolomedicPool()`
 * own the singleton `ConnectionPool` lifecycle; the config is cheap to
 * rebuild on each call and reading from `process.env` is the contract.
 */
export function buildConfig(database: string, envPrefix: DbEnvPrefix = 'DB_'): mssql.config {
  const host = process.env[`${envPrefix}HOST`];
  const port = process.env[`${envPrefix}PORT`];
  const user = process.env[`${envPrefix}USER`];
  const password = process.env[`${envPrefix}PASSWORD`];

  if (!host) throw new Error(`Missing required env var: ${envPrefix}HOST`);
  if (!user) throw new Error(`Missing required env var: ${envPrefix}USER`);
  if (!password) throw new Error(`Missing required env var: ${envPrefix}PASSWORD`);

  return {
    server: host,
    port: port ? parseInt(port, 10) : 1433,
    user,
    password,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };
}

let siglaPool: mssql.ConnectionPool | null = null;

/**
 * Get the process-wide SIGLA / ICCGSA connection pool. Used by every
 * legacy query (consolidados results, informes lookup, etc.). The pool
 * is lazy and singleton — the first call opens it; every subsequent call
 * returns the same instance.
 *
 * The database name comes from `DB_NAME` (defaults to `ICCGSA`).
 */
export async function getPool(): Promise<mssql.ConnectionPool> {
  if (siglaPool) return siglaPool;

  const database = process.env.DB_NAME ?? 'ICCGSA';
  const config = buildConfig(database, 'DB_');
  siglaPool = new mssql.ConnectionPool(config);
  return siglaPool;
}

let holomedicPool: mssql.ConnectionPool | null = null;

/**
 * Get the process-wide HOLOMEDIC connection pool. Used by the template
 * store (`getTemplateDb`). The pool is lazy and singleton — the first
 * call opens it; every subsequent call returns the same instance.
 *
 * Environment variables:
 *  - `HOLOMEDIC_DB_NAME` (default `HOLOMEDIC`) — the database name
 *  - `HOLOMEDIC_DB_HOST`, `HOLOMEDIC_DB_PORT`, `HOLOMEDIC_DB_USER`,
 *    `HOLOMEDIC_DB_PASSWORD` — connection settings. If unset, they fall
 *    back to the SIGLA `DB_*` env vars so ops only have to override
 *    `HOLOMEDIC_DB_NAME` when both pools share a SQL Server instance.
 */
export async function getHolomedicPool(): Promise<mssql.ConnectionPool> {
  if (holomedicPool) return holomedicPool;

  const database = process.env.HOLOMEDIC_DB_NAME ?? 'HOLOMEDIC';
  const envPrefix: DbEnvPrefix = hasHolomedicConnectionEnv() ? 'HOLOMEDIC_DB_' : 'DB_';
  const config = buildConfig(database, envPrefix);
  holomedicPool = new mssql.ConnectionPool(config);
  return holomedicPool;
}

/**
 * `true` when at least one Holomedic-specific connection env var is set,
 * so we honour the override instead of silently falling back to the
 * SIGLA `DB_*` vars. We check HOST because the database name is
 * defaulted and therefore not a reliable signal.
 */
function hasHolomedicConnectionEnv(): boolean {
  return Boolean(
    process.env.HOLOMEDIC_DB_HOST ||
      process.env.HOLOMEDIC_DB_USER ||
      process.env.HOLOMEDIC_DB_PASSWORD,
  );
}
