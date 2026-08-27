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
export type DbEnvPrefix = 'DB_' | 'HOLOMEDIC_DB_' | 'SIGLA_RO_';

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

// ---- SIGLA read-only pool (REQ-03 D1) ----

/**
 * Raised before a connection pool is ever constructed when the resolved
 * SIGLA read-only login is `sa` — the administrative account must never
 * back the valoraciones query path (read-only BY CONSTRUCTION, not by
 * trust in the caller).
 */
export class SiglaRoSaError extends Error {
  constructor(user: string) {
    super(
      `SIGLA read-only pool misconfiguration: resolved user "${user}" is the ` +
        'administrative `sa` account. Set SIGLA_RO_USER (or DB_USER) to a ' +
        'read-only login such as explorar_datos.',
    );
    this.name = 'SiglaRoSaError';
  }
}

let siglaRoPool: mssql.ConnectionPool | null = null;

/**
 * `true` when at least one `SIGLA_RO_*` connection env var is set, so the
 * dedicated read-only overrides win over the shared `DB_*` vars. HOST is
 * the canonical signal (same convention as `hasHolomedicConnectionEnv`).
 */
function hasSiglaRoConnectionEnv(): boolean {
  return Boolean(
    process.env.SIGLA_RO_HOST ||
      process.env.SIGLA_RO_USER ||
      process.env.SIGLA_RO_PASSWORD,
  );
}

/**
 * Get the process-wide SIGLA read-only connection pool used by the
 * valoraciones feature (REQ-03). Read-only by construction:
 *
 *  - Connection vars come from `SIGLA_RO_*`, falling back to the shared
 *    `DB_*` vars when no read-only override is present.
 *  - Database resolves as `SIGLA_RO_NAME ?? DB_NAME ?? 'ICCGSA'`.
 *  - A pre-construction guard throws `SiglaRoSaError` when the resolved
 *    user is `sa` — no pool object is created in that case.
 *
 * Lazy singleton: the first call builds the pool; later calls return it.
 */
export async function getSiglaReadOnlyPool(): Promise<mssql.ConnectionPool> {
  if (siglaRoPool) return siglaRoPool;

  const envPrefix: DbEnvPrefix = hasSiglaRoConnectionEnv() ? 'SIGLA_RO_' : 'DB_';
  const user = process.env[`${envPrefix}USER`];
  if (user && user.trim().toLowerCase() === 'sa') {
    throw new SiglaRoSaError(user);
  }

  const database = process.env.SIGLA_RO_NAME ?? process.env.DB_NAME ?? 'ICCGSA';
  const config = buildConfig(database, envPrefix);
  siglaRoPool = new mssql.ConnectionPool(config);
  return siglaRoPool;
}

/**
 * Test seam — replaces (or clears) the cached read-only pool so unit
 * tests can inject a fake without opening a real SQL Server connection.
 * Pass `null` to clear so the next call rebuilds a real pool.
 */
export function __setSiglaRoPoolForTests(pool: mssql.ConnectionPool | null): void {
  siglaRoPool = pool;
}
