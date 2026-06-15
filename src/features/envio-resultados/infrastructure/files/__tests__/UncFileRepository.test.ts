import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the node:fs module at the module boundary so the suite NEVER
// touches a real UNC share (\\172.16.10.12\sigla). Hoisted so the mock
// is in place before the UncFileRepository module is imported.
const mockReaddir = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());
const mockCreateReadStream = vi.hoisted(() => vi.fn());

// env must be set BEFORE the module under test evaluates its top-level
// `BASE_PATH` constant. `vi.hoisted` runs before every other statement
// in the file, including the production import below.
vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

vi.mock('node:fs', () => {
  const promises = {
    readdir: mockReaddir,
    stat: mockStat,
  };
  return {
    promises,
    createReadStream: mockCreateReadStream,
    default: { promises, createReadStream: mockCreateReadStream },
  };
});

import { UncFileRepository } from '@/features/envio-resultados/infrastructure/files/UncFileRepository';

function makeStats(overrides: Partial<{ size: number; isFile: () => boolean; mtime: Date }> = {}) {
  return {
    size: overrides.size ?? 1024,
    isFile: overrides.isFile ?? (() => true),
    mtime: overrides.mtime ?? new Date('2026-01-01T00:00:00Z'),
  };
}

/** Extract the trailing name from a Windows-style path. */
function basenameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? '';
}

describe('UncFileRepository', () => {
  let repo: UncFileRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new UncFileRepository();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns sorted FileEntry[] from a populated directory', async () => {
      mockReaddir.mockResolvedValueOnce(['z.pdf', 'a.pdf', 'm.pdf']);
      mockStat.mockImplementation(async (p: string) => {
        const name = basenameOf(p);
        const sizes: Record<string, number> = { 'z.pdf': 3000, 'a.pdf': 1000, 'm.pdf': 2000 };
        return makeStats({ size: sizes[name] ?? 100 });
      });

      const result = await repo.list('RUC1', '12345678', 'AT-001');

      expect(result).toEqual([
        { name: 'a.pdf', sizeBytes: 1000, modifiedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'm.pdf', sizeBytes: 2000, modifiedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'z.pdf', sizeBytes: 3000, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ]);
    });

    it('returns [] when the folder does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReaddir.mockRejectedValueOnce(err);

      const result = await repo.list('RUC1', '12345678', 'AT-001');

      expect(result).toEqual([]);
    });

    it('skips a file when its stat fails and still returns the rest', async () => {
      mockReaddir.mockResolvedValueOnce(['a.pdf', 'b.pdf', 'c.pdf']);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockStat.mockImplementation(async (p: string) => {
        const name = basenameOf(p);
        if (name === 'b.pdf') throw new Error('EACCES');
        if (name === 'a.pdf') return makeStats({ size: 100 });
        if (name === 'c.pdf') return makeStats({ size: 300 });
        throw new Error('unexpected file');
      });

      const result = await repo.list('RUC1', '12345678', 'AT-001');

      expect(result.map((f) => f.name)).toEqual(['a.pdf', 'c.pdf']);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('skips a directory entry (isFile() returns false)', async () => {
      mockReaddir.mockResolvedValueOnce(['a.pdf', 'subdir']);
      mockStat.mockImplementation(async (p: string) => {
        const name = basenameOf(p);
        if (name === 'subdir') return makeStats({ isFile: () => false });
        return makeStats({ size: 100 });
      });

      const result = await repo.list('RUC1', '12345678', 'AT-001');

      expect(result).toEqual([{ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' }]);
    });

    it('rethrows non-ENOENT readdir errors so the route can return 502', async () => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockReaddir.mockRejectedValueOnce(err);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(repo.list('RUC1', '12345678', 'AT-001')).rejects.toBe(err);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('stream', () => {
    it('returns a NodeJS Readable stream from createReadStream', async () => {
      const stream = new Readable({ read() {} });
      mockCreateReadStream.mockReturnValueOnce(stream);

      const result = await repo.stream('RUC1', '12345678', 'AT-001', 'informe.pdf');

      expect(result).toBe(stream);
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001\\informe.pdf',
      );
    });
  });

  describe('zipAll', () => {
    it('returns an archiver-shaped object and the resolved folder', () => {
      const { archive, folder } = repo.zipAll('RUC1', '12345678', 'AT-001');

      // archiver is a Duplex stream — verify it has the expected shape.
      // We use the structural type `{ append(): unknown; finalize(): unknown }`
      // to avoid the `Function` global type, which is disallowed by the
      // project's lint config.
      interface ArchiveLike {
        append: () => unknown;
        finalize: () => unknown;
      }
      const arch = archive as unknown as ArchiveLike;
      expect(typeof arch.append).toBe('function');
      expect(typeof arch.finalize).toBe('function');
      expect(folder).toBe('\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001');
    });
  });

  describe('path composition', () => {
    it('joins the UNC base path with ruc/dni/idAten using win32 semantics', async () => {
      mockReaddir.mockResolvedValueOnce([]);

      await repo.list('RUC1', '12345678', 'AT-001');

      expect(mockReaddir).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001',
      );
    });
  });
});
