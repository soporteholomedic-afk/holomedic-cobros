import { afterEach, describe, expect, it } from 'vitest';

import { __setCrmDbForTests, getCrmDb, type CrmDb } from '../getCrmDb';

/**
 * Unit tests for the CRM composition-root seam (ADR-3: one factory,
 * one pool, one idempotent migrate — adapters join as later slices
 * land). The seam IS the contract the API-route and use-case suites
 * (pr3+) rely on to inject fakes without touching SQL Server. The
 * real-connection path (pool + migrate) is exercised by the
 * `migrate.test.ts` integration suite and by production at first
 * request.
 */

/** Identity-only container: the seam tests never invoke the pool. */
function makeFakeDb(tag: string): CrmDb {
  return { tag } as unknown as CrmDb;
}

describe('getCrmDb() test seam', () => {
  afterEach(() => {
    __setCrmDbForTests(null);
  });

  it('returns the container injected through the seam', async () => {
    const fakeDb = makeFakeDb('seam');
    __setCrmDbForTests(fakeDb);
    await expect(getCrmDb()).resolves.toBe(fakeDb);
  });

  it('caches — repeated calls resolve to the same injected instance', async () => {
    const fakeDb = makeFakeDb('cached');
    __setCrmDbForTests(fakeDb);
    const first = await getCrmDb();
    const second = await getCrmDb();
    expect(second).toBe(first);
    expect(second).toBe(fakeDb);
  });

  it('replaces the container when the seam is re-injected (stateful seam)', async () => {
    const firstDb = makeFakeDb('first');
    const secondDb = makeFakeDb('second');
    __setCrmDbForTests(firstDb);
    const first = getCrmDb();
    __setCrmDbForTests(secondDb);
    const second = getCrmDb();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe(secondDb);
    await expect(first).resolves.toBe(firstDb);
  });
  // NOTE: there is deliberately no test for the `null`-clear → rebuild
  // path: the rebuild is the REAL connection path (getHolomedicPool +
  // migrate), exercised by the migrate.test.ts integration suite and by
  // production at first request — same boundary as the asistencia
  // precedent. Every test here ends with `__setCrmDbForTests(null)`,
  // which the suite surviving without a connection attempt confirms.
});
