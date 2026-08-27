import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IFirmaRepository } from '../../domain/ports';

/**
 * Factory tests for `getFirmaDb` (mirror of the `getTemplateDb` suite):
 *  - Lazy-singleton: first call opens the HOLOMEDIC SQL Server pool,
 *    runs the idempotent plantillas `migrate()`, and constructs the
 *    `SqlServerFirmaRepository`. Every subsequent call returns the same
 *    cached promise.
 *  - `__setFirmaDbForTests` seam: replaces the cached repo with a mock
 *    (or clears it so the next call rebuilds from the real pool).
 *  - HOLOMEDIC pool / migrate failures surface (the factory propagates).
 *
 * `migrate()` and `getHolomedicPool()` are mocked at the module
 * boundary so the suite runs without a real SQL Server connection.
 */
describe('getFirmaDb', () => {
  const mockPool = { connect: vi.fn().mockResolvedValue(undefined) } as unknown;
  const mockRepo: IFirmaRepository = {
    getOwnFirma: vi.fn(),
    saveOwnFirma: vi.fn(),
  };
  const migrate = vi.fn().mockResolvedValue(undefined);
  const getHolomedicPool = vi.fn().mockResolvedValue(mockPool);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('@/lib/db', () => ({
      getHolomedicPool,
    }));
    // Use a real class for `SqlServerFirmaRepository` so the adapter's
    // `new SqlServerFirmaRepository(pool)` works without vi.fn /
    // arrow-function / `new` quirks.
    class MockAdapter {
      constructor() {
        return mockRepo;
      }
    }
    vi.doMock('../sqlserver', () => ({
      SqlServerFirmaRepository: MockAdapter,
      migrate,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('../sqlserver');
    vi.resetModules();
  });

  async function loadFactory(): Promise<{
    getFirmaDb: () => Promise<IFirmaRepository>;
    __setFirmaDbForTests: (repo: IFirmaRepository | null) => void;
  }> {
    return (await import('../getFirmaDb')) as unknown as {
      getFirmaDb: () => Promise<IFirmaRepository>;
      __setFirmaDbForTests: (repo: IFirmaRepository | null) => void;
    };
  }

  function makeMockRepo(): IFirmaRepository {
    return {
      getOwnFirma: vi.fn().mockResolvedValue(null),
      saveOwnFirma: vi.fn().mockResolvedValue(undefined),
    };
  }

  describe('singleton caching + __setFirmaDbForTests seam', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      const { getFirmaDb } = await loadFactory();
      const a = await getFirmaDb();
      const b = await getFirmaDb();
      expect(a).toBe(b);
    });

    it('uses the injected mock after __setFirmaDbForTests', async () => {
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setFirmaDbForTests(mock);
      expect(await getFirmaDb()).toBe(mock);
    });

    it('the swap is observable on the very next call', async () => {
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      const first = makeMockRepo();
      const second = makeMockRepo();
      __setFirmaDbForTests(first);
      expect(await getFirmaDb()).toBe(first);
      __setFirmaDbForTests(second);
      expect(await getFirmaDb()).toBe(second);
    });

    it('after clearing the seam, the factory produces a fresh instance', async () => {
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setFirmaDbForTests(mock);
      expect(await getFirmaDb()).toBe(mock);
      __setFirmaDbForTests(null);
      const fresh = await getFirmaDb();
      expect(fresh).not.toBe(mock);
    });
  });

  describe('real build path (HOLOMEDIC pool + plantillas migrate + adapter)', () => {
    it('opens the HOLOMEDIC pool, runs the plantillas migrate, and constructs the adapter', async () => {
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      __setFirmaDbForTests(null);
      const repo = await getFirmaDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledWith(mockPool);
      expect(repo).toBe(mockRepo);
    });

    it('runs migrate exactly once across multiple calls (singleton)', async () => {
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      __setFirmaDbForTests(null);
      await getFirmaDb();
      await getFirmaDb();
      await getFirmaDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
    });

    it('propagates pool errors so the route can map them to HTTP 500', async () => {
      getHolomedicPool.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      __setFirmaDbForTests(null);

      await expect(getFirmaDb()).rejects.toThrow('ECONNREFUSED');
    });

    it('propagates migrate errors so the route can map them to HTTP 500', async () => {
      migrate.mockRejectedValueOnce(new Error('permission denied'));
      const { getFirmaDb, __setFirmaDbForTests } = await loadFactory();
      __setFirmaDbForTests(null);

      await expect(getFirmaDb()).rejects.toThrow('permission denied');
    });
  });
});
