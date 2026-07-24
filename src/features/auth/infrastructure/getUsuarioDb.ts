import type { IUsuarioRepository } from '../domain/ports';
import { getHolomedicPool } from '@/lib/db';
import { SqlServerUsuarioRepository, migrate } from './sqlserver';

let cached: Promise<IUsuarioRepository> | null = null;

export function getUsuarioDb(): Promise<IUsuarioRepository> {
  if (cached) return cached;
  cached = (async (): Promise<IUsuarioRepository> => {
    const pool = await getHolomedicPool();
    await pool.connect();
    await migrate(pool);
    return new SqlServerUsuarioRepository(pool);
  })();
  return cached;
}

export function __setUsuarioDbForTests(repo: IUsuarioRepository | null): void {
  cached = repo ? Promise.resolve(repo) : null;
}
