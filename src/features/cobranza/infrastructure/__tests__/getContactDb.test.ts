import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICompanyContactRepository } from '../../domain/ports';

/**
 * Factory tests for `getContactDb` (T1a.6 / T4.2), mirrored on the
 * plantillas-editor `getTemplateDb` suite. The factory:
 *  - Lazy-singleton: first call opens the HOLOMEDIC SQL Server pool,
 *    runs the idempotent `migrate()`, and constructs the
 *    `SqlServerContactRepository`. Every subsequent call returns the
 *    same cached promise.
 *  - `__setContactDbForTests` seam: replaces the cached repo with a
 *    mock (or clears it so the next call rebuilds from the real pool).
 *  - HOLOMEDIC pool / migrate failures surface (the route maps 500).
 *
 * `migrate()` and `getHolomedicPool()` are mocked at the module
 * boundary so the suite runs without a real SQL Server connection.
 */
describe('getContactDb', () => {
  const mockPool = { connect: vi.fn().mockResolvedValue(undefined) };
  const mockRepo: ICompanyContactRepository = {
    getByRuc: vi.fn(),
    upsert: vi.fn(),
  };
  const migrate = vi.fn().mockResolvedValue(undefined);
  const getHolomedicPool = vi.fn().mockResolvedValue(mockPool);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('@/lib/db', () => ({
      getHolomedicPool,
    }));
    // Use a real class for `SqlServerContactRepository` so the
    // adapter's `new SqlServerContactRepository(pool)` works without
    // vi.fn / arrow-function / `new` quirks.
    class MockAdapter {
      constructor() {
        return mockRepo;
      }
    }
    vi.doMock('../sqlserver', () => ({
      SqlServerContactRepository: MockAdapter,
      migrate,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('../sqlserver');
    vi.resetModules();
  });

  async function loadFactory(): Promise<{
    getContactDb: () => Promise<ICompanyContactRepository>;
    __setContactDbForTests: (repo: ICompanyContactRepository | null) => void;
  }> {
    return (await import('../getContactDb')) as unknown as {
      getContactDb: () => Promise<ICompanyContactRepository>;
      __setContactDbForTests: (repo: ICompanyContactRepository | null) => void;
    };
  }

  function makeMockRepo(): ICompanyContactRepository {
    return {
      getByRuc: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({} as never),
    };
  }

  describe('singleton caching + __setContactDbForTests seam', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      const { getContactDb } = await loadFactory();
      const a = await getContactDb();
      const b = await getContactDb();
      expect(a).toBe(b);
    });

    it('uses the injected mock after __setContactDbForTests', async () => {
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setContactDbForTests(mock);
      expect(await getContactDb()).toBe(mock);
    });

    it('the swap is observable on the very next call', async () => {
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      const first = makeMockRepo();
      const second = makeMockRepo();
      __setContactDbForTests(first);
      expect(await getContactDb()).toBe(first);
      __setContactDbForTests(second);
      expect(await getContactDb()).toBe(second);
    });

    it('after clearing the seam, the factory produces a fresh instance', async () => {
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setContactDbForTests(mock);
      expect(await getContactDb()).toBe(mock);
      __setContactDbForTests(null);
      const fresh = await getContactDb();
      expect(fresh).not.toBe(mock);
    });
  });

  describe('real build path (HOLOMEDIC pool + migrate + adapter)', () => {
    it('opens the HOLOMEDIC pool, connects, runs migrate, and constructs the adapter', async () => {
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      __setContactDbForTests(null);
      const repo = await getContactDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledWith(mockPool);
      expect(repo).toBe(mockRepo);
    });

    it('runs migrate exactly once across multiple calls (singleton)', async () => {
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      __setContactDbForTests(null);
      await getContactDb();
      await getContactDb();
      await getContactDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
    });

    it('propagates pool errors so the route can map them to HTTP 500', async () => {
      getHolomedicPool.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      __setContactDbForTests(null);

      await expect(getContactDb()).rejects.toThrow('ECONNREFUSED');
    });

    it('propagates migrate errors so the route can map them to HTTP 500', async () => {
      migrate.mockRejectedValueOnce(new Error('permission denied'));
      const { getContactDb, __setContactDbForTests } = await loadFactory();
      __setContactDbForTests(null);

      await expect(getContactDb()).rejects.toThrow('permission denied');
    });
  });
});
