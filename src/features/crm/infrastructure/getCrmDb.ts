import type { ICrmEmpresaRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { SqlServerCrmEmpresaRepository, migrate } from './sqlserver';

let cached: Promise<ICrmEmpresaRepository> | null = null;

export function getCrmDb(): Promise<ICrmEmpresaRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ICrmEmpresaRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerCrmEmpresaRepository(pool);
  })();
  return cached;
}

export function __setCrmDbForTests(repo: ICrmEmpresaRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
