import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ITemplateRepository } from '../../domain/ports';

/**
 * Factory tests for `getTemplateDb`. The new factory:
 *  - Lazy-singleton: first call opens the HOLOMEDIC SQL Server pool,
 *    runs the idempotent `migrate()`, and constructs the
 *    `SqlServerTemplateRepository`. Every subsequent call returns the
 *    same cached promise.
 *  - `__setTemplateDbForTests` seam: replaces the cached repo with a
 *    mock (or clears it so the next call rebuilds from the real pool).
 *  - HOLOMEDIC pool failure surfaces (the factory propagates).
 *
 * `migrate()` and `getHolomedicPool()` are mocked at the module
 * boundary so the suite runs without a real SQL Server connection.
 */
describe('getTemplateDb', () => {
  const mockPool = { connect: vi.fn().mockResolvedValue(undefined) } as unknown;
  const mockRepo: ITemplateRepository = {
    listByArea: vi.fn(),
    listByAreaAndType: vi.fn(),
    listDeletedByArea: vi.fn(),
    getById: vi.fn(),
    save: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    clone: vi.fn(),
    setDefault: vi.fn(),
    listVersions: vi.fn(),
    rollback: vi.fn(),
  };
  const migrate = vi.fn().mockResolvedValue(undefined);
  const getHolomedicPool = vi.fn().mockResolvedValue(mockPool);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('@/lib/db', () => ({
      getHolomedicPool,
    }));
    // Use a real class for `SqlServerTemplateRepository` so the
    // adapter's `new SqlServerTemplateRepository(pool)` works without
    // vi.fn / arrow-function / `new` quirks.
    class MockAdapter {
      constructor() {
        return mockRepo;
      }
    }
    vi.doMock('../sqlserver', () => ({
      SqlServerTemplateRepository: MockAdapter,
      migrate,
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/lib/db');
    vi.doUnmock('../sqlserver');
    vi.resetModules();
  });

  async function loadFactory(): Promise<{
    getTemplateDb: () => Promise<ITemplateRepository>;
    __setTemplateDbForTests: (repo: ITemplateRepository | null) => void;
  }> {
    return (await import('../getTemplateDb')) as unknown as {
      getTemplateDb: () => Promise<ITemplateRepository>;
      __setTemplateDbForTests: (repo: ITemplateRepository | null) => void;
    };
  }

  function makeMockRepo(): ITemplateRepository {
    return {
      listByArea: vi.fn().mockResolvedValue([]),
      listByAreaAndType: vi.fn().mockResolvedValue([]),
      listDeletedByArea: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue({} as never),
      softDelete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      clone: vi.fn().mockResolvedValue({} as never),
      setDefault: vi.fn().mockResolvedValue(undefined),
      listVersions: vi.fn().mockResolvedValue([]),
      rollback: vi.fn().mockResolvedValue({} as never),
    };
  }

  describe('singleton caching + __setTemplateDbForTests seam', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      const { getTemplateDb } = await loadFactory();
      const a = await getTemplateDb();
      const b = await getTemplateDb();
      expect(a).toBe(b);
    });

    it('uses the injected mock after __setTemplateDbForTests', async () => {
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setTemplateDbForTests(mock);
      expect(await getTemplateDb()).toBe(mock);
    });

    it('the swap is observable on the very next call', async () => {
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      const first = makeMockRepo();
      const second = makeMockRepo();
      __setTemplateDbForTests(first);
      expect(await getTemplateDb()).toBe(first);
      __setTemplateDbForTests(second);
      expect(await getTemplateDb()).toBe(second);
    });

    it('after clearing the seam, the factory produces a fresh instance', async () => {
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setTemplateDbForTests(mock);
      expect(await getTemplateDb()).toBe(mock);
      __setTemplateDbForTests(null);
      const fresh = await getTemplateDb();
      expect(fresh).not.toBe(mock);
    });
  });

  describe('real build path (HOLOMEDIC pool + migrate + adapter)', () => {
    it('opens the HOLOMEDIC pool, runs migrate, and constructs the adapter', async () => {
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);
      const repo = await getTemplateDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledWith(mockPool);
      expect(repo).toBe(mockRepo);
    });

    it('runs migrate exactly once across multiple calls (singleton)', async () => {
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);
      await getTemplateDb();
      await getTemplateDb();
      await getTemplateDb();

      expect(getHolomedicPool).toHaveBeenCalledTimes(1);
      expect(migrate).toHaveBeenCalledTimes(1);
    });

    it('propagates pool errors so the route can map them to HTTP 500', async () => {
      getHolomedicPool.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);

      await expect(getTemplateDb()).rejects.toThrow('ECONNREFUSED');
    });

    it('propagates migrate errors so the route can map them to HTTP 500', async () => {
      migrate.mockRejectedValueOnce(new Error('permission denied'));
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);

      await expect(getTemplateDb()).rejects.toThrow('permission denied');
    });
  });
});
