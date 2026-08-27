import type { ISiglaValoracionesRepository } from '../domain/ports';
import { getSiglaReadOnlyPool } from '@/lib/db';

import { SiglaValoracionesRepository } from './sqlserver';

let cached: Promise<ISiglaValoracionesRepository> | null = null;

/**
 * Return the process-wide valoraciones repository (a cached Promise).
 *
 * The first call:
 *   1. Opens the singleton SIGLA read-only pool via
 *      `getSiglaReadOnlyPool()` (env vars: `SIGLA_RO_*` falling back to
 *      `DB_*`; `sa` is rejected pre-construction — REQ-03 D1).
 *   2. Connects it.
 *   3. Wraps the pool in `SiglaValoracionesRepository`.
 *
 * Every subsequent call returns the same cached promise (the
 * `getContactDb` / `getTemplateDb` singleton + test-seam philosophy).
 */
export function getValoracionesDb(): Promise<ISiglaValoracionesRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ISiglaValoracionesRepository> => {
    const pool = await getSiglaReadOnlyPool();
    await pool.connect();
    return new SiglaValoracionesRepository(pool);
  })();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit tests
 * can inject a mock `ISiglaValoracionesRepository` without opening a
 * real SQL Server connection. Pass `null` to clear so the next call
 * rebuilds a real adapter.
 */
export function __setValoracionesDbForTests(
  repo: ISiglaValoracionesRepository | null,
): void {
  cached = repo ? Promise.resolve(repo) : null;
}
