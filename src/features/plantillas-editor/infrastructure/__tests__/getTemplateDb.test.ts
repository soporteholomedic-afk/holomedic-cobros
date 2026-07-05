import { existsSync, mkdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ITemplateRepository } from '../../domain/ports';

/**
 * Factory tests for `getTemplateDb`. Covers:
 *  - `resolveTemplateDbDriver()` pure selection logic (spec
 *    `email-template-store`: "Primary adapter selected by default" +
 *    "Fallback adapter via env").
 *  - Singleton caching + `__setTemplateDbForTests` seam (mirrors
 *    `getFileRepository.test.ts`).
 *  - Real build selection: default driver produces a WORKING better-sqlite3
 *    adapter; `TEMPLATE_DB_DRIVER=sql.js` produces a WORKING sql.js adapter
 *    (behavioural proof, not instanceof — survives module re-imports).
 *
 * `SQLITE_DB_PATH` and `TEMPLATE_DB_DRIVER` are read from `platform.ts` at
 * module-load time, so the build tests reset the module registry and set
 * the env BEFORE re-importing the factory — same pattern as
 * `platform.test.ts`.
 */
describe('getTemplateDb', () => {
  const origSqlitePath = process.env.SQLITE_DB_PATH;
  const origDriver = process.env.TEMPLATE_DB_DRIVER;
  let tmpFiles: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    tmpFiles = [];
  });

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        rmSync(f, { force: true });
      } catch {
        // ignore
      }
    }
    if (origSqlitePath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = origSqlitePath;
    if (origDriver === undefined) delete process.env.TEMPLATE_DB_DRIVER;
    else process.env.TEMPLATE_DB_DRIVER = origDriver;
    vi.resetModules();
  });

  async function loadFactory(): Promise<{
    getTemplateDb: () => Promise<ITemplateRepository>;
    __setTemplateDbForTests: (repo: ITemplateRepository | null) => void;
    resolveTemplateDbDriver: (env?: string | undefined) => 'better-sqlite3' | 'sql.js';
  }> {
    return (await import('../getTemplateDb')) as unknown as {
      getTemplateDb: () => Promise<ITemplateRepository>;
      __setTemplateDbForTests: (repo: ITemplateRepository | null) => void;
      resolveTemplateDbDriver: (env?: string | undefined) => 'better-sqlite3' | 'sql.js';
    };
  }

  function makeMockRepo(): ITemplateRepository {
    return {
      listByArea: vi.fn().mockResolvedValue([]),
      listByAreaAndType: vi.fn().mockResolvedValue([]),
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

  describe('resolveTemplateDbDriver (pure selection logic)', () => {
    it("defaults to 'better-sqlite3' when the env var is unset", async () => {
      const { resolveTemplateDbDriver } = await loadFactory();
      expect(resolveTemplateDbDriver(undefined)).toBe('better-sqlite3');
    });

    it("returns 'sql.js' when the env var is 'sql.js'", async () => {
      const { resolveTemplateDbDriver } = await loadFactory();
      expect(resolveTemplateDbDriver('sql.js')).toBe('sql.js');
    });

    it("returns 'better-sqlite3' for an unknown value (safe default)", async () => {
      const { resolveTemplateDbDriver } = await loadFactory();
      expect(resolveTemplateDbDriver('garbage')).toBe('better-sqlite3');
    });
  });

  describe('singleton caching + __setTemplateDbForTests seam', () => {
    it('returns the same instance on subsequent calls (caching)', async () => {
      process.env.SQLITE_DB_PATH = ':memory:';
      delete process.env.TEMPLATE_DB_DRIVER;
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
      process.env.SQLITE_DB_PATH = ':memory:';
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      const mock = makeMockRepo();
      __setTemplateDbForTests(mock);
      expect(await getTemplateDb()).toBe(mock);
      __setTemplateDbForTests(null);
      const fresh = await getTemplateDb();
      expect(fresh).not.toBe(mock);
    });
  });

  describe('real build selection (behavioural proof)', () => {
    it('builds a working better-sqlite3 adapter by default (spec: primary adapter selected by default)', async () => {
      process.env.SQLITE_DB_PATH = ':memory:';
      delete process.env.TEMPLATE_DB_DRIVER;
      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);
      const repo = await getTemplateDb();

      // Behavioural proof: a real, working repository over :memory:.
      const saved = await repo.save({
        area: 'consolidados',
        type: 'company',
        name: 'T',
        subject: 's',
        bodyHtml: '<p>b</p>',
      });
      expect(saved.id).toBeTruthy();
      const fetched = await repo.getById(saved.id);
      expect(fetched?.subject).toBe('s');
    });

    it('builds a working sql.js adapter when TEMPLATE_DB_DRIVER=sql.js (spec: fallback adapter via env)', async () => {
      process.env.TEMPLATE_DB_DRIVER = 'sql.js';
      const tmp = path.join(os.tmpdir(), `holomedic-template-test-${Date.now()}.db`);
      tmpFiles.push(tmp);
      process.env.SQLITE_DB_PATH = tmp;
      // Pre-create the parent dir (tmpdir usually exists, but be safe).
      mkdirSync(path.dirname(tmp), { recursive: true });

      const { getTemplateDb, __setTemplateDbForTests } = await loadFactory();
      __setTemplateDbForTests(null);
      const repo = await getTemplateDb();

      const saved = await repo.save({
        area: 'consolidados',
        type: 'company',
        name: 'T',
        subject: 'sql.js subject',
        bodyHtml: '<p>b</p>',
      });
      expect(saved.id).toBeTruthy();
      const fetched = await repo.getById(saved.id);
      expect(fetched?.subject).toBe('sql.js subject');

      // The sql.js adapter calls persist() after every mutation, so the temp
      // file MUST now exist (proof the fallback flushes to disk).
      expect(existsSync(tmp)).toBe(true);
    });
  });
});
