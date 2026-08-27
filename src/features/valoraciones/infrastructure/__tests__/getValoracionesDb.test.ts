import { describe, it, expect, vi, beforeEach } from 'vitest';
import type mssql from 'mssql';

import { SiglaValoracionesRepository } from '../sqlserver/SiglaValoracionesRepository';
import { getValoracionesDb, __setValoracionesDbForTests } from '../getValoracionesDb';

const mockGetSiglaReadOnlyPool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  getSiglaReadOnlyPool: mockGetSiglaReadOnlyPool,
}));

describe('getValoracionesDb — cached-promise factory (REQ-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setValoracionesDbForTests(null);
  });

  it('opens the RO pool once, connects, and wraps the repository in a cached promise', async () => {
    const fakePool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn(),
    } as unknown as mssql.ConnectionPool;
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(fakePool);

    const a = await getValoracionesDb();
    const b = await getValoracionesDb();

    expect(a).toBe(b);
    expect(a).toBeInstanceOf(SiglaValoracionesRepository);
    expect(mockGetSiglaReadOnlyPool).toHaveBeenCalledTimes(1);
    expect(fakePool.connect).toHaveBeenCalledTimes(1);
  });

  it('__setValoracionesDbForTests injects a fake and null rebuilds from the pool', async () => {
    const fakeRepo = { fake: true } as unknown as Awaited<ReturnType<typeof getValoracionesDb>>;
    __setValoracionesDbForTests(fakeRepo);
    await expect(getValoracionesDb()).resolves.toBe(fakeRepo);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();

    __setValoracionesDbForTests(null);
    const fakePool = {
      connect: vi.fn().mockResolvedValue(undefined),
      request: vi.fn(),
    } as unknown as mssql.ConnectionPool;
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(fakePool);

    const repo = await getValoracionesDb();
    expect(repo).toBeInstanceOf(SiglaValoracionesRepository);
  });
});
