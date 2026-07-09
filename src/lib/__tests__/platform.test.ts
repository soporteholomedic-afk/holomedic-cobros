import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `platform.ts` evaluates `process.platform` and
 * `process.env.FILE_SERVER_BASE_PATH` at module load time. To exercise
 * the different branches we dynamically re-import the module after
 * setting the env var, resetting the module registry between cases.
 */

describe('platform', () => {
  const originalEnv = process.env.FILE_SERVER_BASE_PATH;
  const originalSqlitePath = process.env.SQLITE_DB_PATH;
  const originalDriver = process.env.TEMPLATE_DB_DRIVER;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore so other suites are unaffected.
    if (originalEnv === undefined) {
      delete process.env.FILE_SERVER_BASE_PATH;
    } else {
      process.env.FILE_SERVER_BASE_PATH = originalEnv;
    }
    if (originalSqlitePath === undefined) {
      delete process.env.SQLITE_DB_PATH;
    } else {
      process.env.SQLITE_DB_PATH = originalSqlitePath;
    }
    if (originalDriver === undefined) {
      delete process.env.TEMPLATE_DB_DRIVER;
    } else {
      process.env.TEMPLATE_DB_DRIVER = originalDriver;
    }
    vi.resetModules();
  });

  async function loadPlatform() {
    const mod = await import('../platform');
    return mod;
  }

  describe('isWindows', () => {
    it('reflects the real process.platform (no env coupling)', async () => {
      const { isWindows } = await loadPlatform();
      expect(isWindows).toBe(process.platform === 'win32');
    });
  });

  describe('FILE_SERVER_BASE_PATH', () => {
    it('uses the env var when set (Windows UNC path)', async () => {
      process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
      const { FILE_SERVER_BASE_PATH } = await loadPlatform();
      expect(FILE_SERVER_BASE_PATH).toBe('\\\\172.16.10.12\\sigla');
    });

    it('uses the env var when set (Linux mount point)', async () => {
      process.env.FILE_SERVER_BASE_PATH = '/mnt/sigla';
      const { FILE_SERVER_BASE_PATH } = await loadPlatform();
      expect(FILE_SERVER_BASE_PATH).toBe('/mnt/sigla');
    });

    it('falls back to the platform default when the env var is unset', async () => {
      delete process.env.FILE_SERVER_BASE_PATH;
      const { FILE_SERVER_BASE_PATH, isWindows } = await loadPlatform();
      if (isWindows) {
        expect(FILE_SERVER_BASE_PATH).toBe('\\\\172.16.10.12\\sigla');
      } else {
        expect(FILE_SERVER_BASE_PATH).toBe('/mnt/sigla');
      }
    });
  });

  describe('pathOs selection (format-based, not OS-based)', () => {
    it('selects path.win32 when the base path contains a backslash (UNC)', async () => {
      process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
      const { pathOs } = await loadPlatform();
      // win32.join uses backslashes.
      expect(pathOs.join('root', 'a', 'b')).toBe('root\\a\\b');
      expect(pathOs.sep).toBe('\\');
    });

    it('selects path.posix when the base path is a POSIX mount point', async () => {
      process.env.FILE_SERVER_BASE_PATH = '/mnt/sigla';
      const { pathOs } = await loadPlatform();
      expect(pathOs.join('root', 'a', 'b')).toBe('root/a/b');
      expect(pathOs.sep).toBe('/');
    });

    it('keeps UNC-path tests passing on a POSIX runner (the core invariant)', async () => {
      // This is the exact value the existing UncFileRepository suite
      // injects. On a Linux runner it MUST still resolve to win32
      // semantics so the backslash assertions hold.
      process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
      const { pathOs } = await loadPlatform();
      expect(pathOs.sep).toBe('\\');
      expect(pathOs.join('\\\\172.16.10.12\\sigla', 'RUC1', '12345678', 'AT-001')).toBe(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001',
      );
    });

    it('composes a real Linux mount path with posix separators', async () => {
      process.env.FILE_SERVER_BASE_PATH = '/mnt/sigla';
      const { pathOs } = await loadPlatform();
      expect(pathOs.join('/mnt/sigla', '20467250184', '46027972', '0128381', 'LEGAJOS')).toBe(
        '/mnt/sigla/20467250184/46027972/0128381/LEGAJOS',
      );
    });
  });

  describe('SQLITE_DB_PATH', () => {
    it('uses the env var when set (Linux path)', async () => {
      process.env.SQLITE_DB_PATH = '/var/data/holomedic-templates.db';
      const { SQLITE_DB_PATH } = await loadPlatform();
      expect(SQLITE_DB_PATH).toBe('/var/data/holomedic-templates.db');
    });

    it('uses the env var when set (Windows path)', async () => {
      process.env.SQLITE_DB_PATH = 'C:\\ProgramData\\holomedic\\templates.db';
      const { SQLITE_DB_PATH } = await loadPlatform();
      expect(SQLITE_DB_PATH).toBe('C:\\ProgramData\\holomedic\\templates.db');
    });

    it('falls back to the platform default when the env var is unset', async () => {
      delete process.env.SQLITE_DB_PATH;
      const { SQLITE_DB_PATH, isWindows } = await loadPlatform();
      if (isWindows) {
        // APPDATA-driven default lives under a holomedic folder and is templates.db
        expect(SQLITE_DB_PATH.endsWith('templates.db')).toBe(true);
        expect(SQLITE_DB_PATH.includes('holomedic')).toBe(true);
      } else {
        expect(SQLITE_DB_PATH).toBe('./data/holomedic-templates.db');
      }
    });
  });

  describe('TEMPLATE_DB_DRIVER', () => {
    it("defaults to 'better-sqlite3' when the env var is unset", async () => {
      delete process.env.TEMPLATE_DB_DRIVER;
      const { TEMPLATE_DB_DRIVER } = await loadPlatform();
      expect(TEMPLATE_DB_DRIVER).toBe('better-sqlite3');
    });

    it("uses 'sql.js' when the env var is set to sql.js", async () => {
      process.env.TEMPLATE_DB_DRIVER = 'sql.js';
      const { TEMPLATE_DB_DRIVER } = await loadPlatform();
      expect(TEMPLATE_DB_DRIVER).toBe('sql.js');
    });

    it("uses 'better-sqlite3' when the env var is set explicitly", async () => {
      process.env.TEMPLATE_DB_DRIVER = 'better-sqlite3';
      const { TEMPLATE_DB_DRIVER } = await loadPlatform();
      expect(TEMPLATE_DB_DRIVER).toBe('better-sqlite3');
    });
  });
});
