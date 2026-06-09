import mssql from 'mssql';

let pool: mssql.ConnectionPool | null = null;

function buildConfig(): mssql.config {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host) throw new Error('Missing required env var: DB_HOST');
  if (!user) throw new Error('Missing required env var: DB_USER');
  if (!password) throw new Error('Missing required env var: DB_PASSWORD');
  if (!database) throw new Error('Missing required env var: DB_NAME');

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

export async function getPool(): Promise<mssql.ConnectionPool> {
  if (pool) return pool;

  const config = buildConfig();
  pool = new mssql.ConnectionPool(config);
  return pool;
}
