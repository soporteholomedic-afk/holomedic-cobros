import type { ISiglaValoracionesRepository } from '../domain/ports';
import { getPool } from '@/lib/db';

import { SiglaValoracionesRepository } from './sqlserver';

let cached: Promise<ISiglaValoracionesRepository> | null = null;

/**
 * Return the process-wide valoraciones repository (a cached Promise).
 *
 * The first call:
 *   1. Opens the standard SIGLA app pool via `getPool()` from `@/lib/db`
 *      (env vars: `DB_*`, same pool as every other SIGLA query).
 *   2. Connects it.
 *   3. Wraps the pool in `SiglaValoracionesRepository`.
 *
 * The pool itself is the generic app pool; read-only is enforced at the
 * QUERY level — this module only issues SELECTs and EXECUTEs report SPs,
 * never writes. (REQ-03 §3's credential clause governs AI-agent DB
 * exploration — EXPLORADOR_DATOS per AGENTS.md — not the runtime pool.)
 *
 * Every subsequent call returns the same cached promise (the
 * `getContactDb` / `getTemplateDb` singleton + test-seam philosophy).
 */
export function getValoracionesDb(): Promise<ISiglaValoracionesRepository> {
  if (cached) return cached;
  cached = (async (): Promise<ISiglaValoracionesRepository> => {
    const pool = await getPool();
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
