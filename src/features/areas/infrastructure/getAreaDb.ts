import type { IAreaRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { SqlServerAreaRepository, migrate } from './sqlserver';

let cached: Promise<IAreaRepository> | null = null;

export function getAreaDb(): Promise<IAreaRepository> {
  if (cached) return cached;
  cached = (async (): Promise<IAreaRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerAreaRepository(pool);
  })();
  return cached;
}

export function __setAreaDbForTests(repo: IAreaRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
