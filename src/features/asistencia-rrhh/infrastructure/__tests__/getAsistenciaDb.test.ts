import { describe, it, expect, afterEach } from 'vitest';

import {
  getAsistenciaDb,
  __setAsistenciaDbForTests,
  type AsistenciaDb,
} from '../getAsistenciaDb';

/**
 * Unit tests for the asistencia-rrhh composition root (ADR-3: one
 * factory, one pool, one migrate + seed, seven adapters) exercised
 * through its test seam — the seam IS the contract the API-route and
 * use-case suites (WU5+) rely on to inject fakes without touching SQL
 * Server. The real-connection path is exercised in production at first
 * request (migrate()/seedParametros() carry their own SQL contracts).
 */

/** Identity-only container: the seam tests never invoke adapter methods. */
function makeFakeDb(tag: string): AsistenciaDb {
  return { tag } as unknown as AsistenciaDb;
}

describe('getAsistenciaDb() test seam', () => {
  afterEach(() => {
    __setAsistenciaDbForTests(null);
  });

  it('returns the container injected through the seam', async () => {
    const fakeDb = makeFakeDb('seam');
    __setAsistenciaDbForTests(fakeDb);
    await expect(getAsistenciaDb()).resolves.toBe(fakeDb);
  });

  it('caches — repeated calls resolve to the same injected instance', async () => {
    const fakeDb = makeFakeDb('cached');
    __setAsistenciaDbForTests(fakeDb);
    const first = await getAsistenciaDb();
    const second = await getAsistenciaDb();
    expect(second).toBe(first);
    expect(second).toBe(fakeDb);
  });

  it('replaces the container when the seam is re-injected (stateful seam)', async () => {
    const firstDb = makeFakeDb('first');
    const secondDb = makeFakeDb('second');
    __setAsistenciaDbForTests(firstDb);
    const first = getAsistenciaDb();
    __setAsistenciaDbForTests(secondDb);
    const second = getAsistenciaDb();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBe(secondDb);
    await expect(first).resolves.toBe(firstDb);
  });
});
