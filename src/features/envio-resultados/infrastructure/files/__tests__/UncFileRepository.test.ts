import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileSystemNode } from '@/features/envio-resultados/domain/ports';

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

function makeStats(overrides: Partial<{ size: number; isFile: () => boolean; isDirectory: () => boolean; mtime: Date }> = {}) {
  return {
    size: overrides.size ?? 1024,
    isFile: overrides.isFile ?? (() => true),
    isDirectory: overrides.isDirectory ?? (() => false),
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

  describe('listFolder', () => {
    it('returns folders FIRST then files, both sorted case-insensitively', async () => {
      mockReaddir.mockResolvedValueOnce(['z.pdf', 'A', 'm.pdf', 'b', 'C']);
      mockStat.mockImplementation(async (p: string) => {
        const name = basenameOf(p);
        if (name === 'A' || name === 'b' || name === 'C') {
          return makeStats({ isFile: () => false, isDirectory: () => true });
        }
        const sizes: Record<string, number> = { 'z.pdf': 3000, 'm.pdf': 2000 };
        return makeStats({ size: sizes[name] ?? 100 });
      });

      const result = await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      // Folders sorted case-insensitively: A, b, C → [A, b, C]
      // Files sorted case-insensitively: m.pdf, z.pdf
      expect(result).toHaveLength(5);
      const folders = result.filter((n) => n.kind === 'folder').map((n) => n.name);
      const files = result.filter((n) => n.kind === 'file').map((n) => n.name);
      expect(folders).toEqual(['A', 'b', 'C']);
      expect(files).toEqual(['m.pdf', 'z.pdf']);
    });

    it('returns FileNode entries with size + ISO 8601 modifiedAt', async () => {
      mockReaddir.mockResolvedValueOnce(['a.pdf']);
      mockStat.mockResolvedValueOnce(makeStats({ size: 4096, mtime: new Date('2026-06-01T12:00:00Z') }));

      const result = await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      expect(result).toHaveLength(1);
      const file = result[0];
      expect(file.kind).toBe('file');
      // The `result[0]` is the union `FileSystemNode | FolderNode`; we
      // assert at runtime that it's a file and then read the file-only
      // fields. The `as unknown as` cast is the only way to break out
      // of TS's exhaustive-discriminant narrowing in a single-line
      // assertion context.
      const fileNode = file as unknown as {
        kind: 'file';
        name: string;
        sizeBytes: number;
        modifiedAt: string;
      };
      expect(fileNode.name).toBe('a.pdf');
      expect(fileNode.sizeBytes).toBe(4096);
      expect(fileNode.modifiedAt).toBe('2026-06-01T12:00:00.000Z');
    });

    it('returns FolderNode entries with only name populated', async () => {
      mockReaddir.mockResolvedValueOnce(['subdir']);
      mockStat.mockResolvedValueOnce(makeStats({ isFile: () => false, isDirectory: () => true }));

      const result = await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      expect(result).toHaveLength(1);
      const folder = result[0];
      expect(folder.kind).toBe('folder');
      expect(folder.name).toBe('subdir');
      // Folder nodes are pure data — no children at this point (lazy).
      expect((folder as { isLoaded?: () => boolean }).isLoaded?.()).toBe(false);
    });

    it('returns [] when the folder does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReaddir.mockRejectedValueOnce(err);

      const result = await repo.listFolder('RUC1', '12345678', 'AT-001', '');

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

      const result = await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      expect(result.map((f) => f.name)).toEqual(['a.pdf', 'c.pdf']);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('rethrows non-ENOENT readdir errors so the route can return 502', async () => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockReaddir.mockRejectedValueOnce(err);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(repo.listFolder('RUC1', '12345678', 'AT-001', '')).rejects.toBe(err);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('emits a structured warn when a file exceeds the size threshold', async () => {
      mockReaddir.mockResolvedValueOnce(['big.pdf', 'small.pdf']);
      mockStat.mockImplementation(async (p: string) => {
        const name = basenameOf(p);
        if (name === 'big.pdf') return makeStats({ size: 100 * 1024 * 1024 });
        return makeStats({ size: 100 });
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      expect(warnSpy).toHaveBeenCalled();
      const call = warnSpy.mock.calls.find((args) =>
        JSON.stringify(args).includes('large file'),
      );
      expect(call).toBeTruthy();
      warnSpy.mockRestore();
    });

    it('NEVER calls console.log (the operator debug line was removed)', async () => {
      mockReaddir.mockResolvedValue(['a.pdf']);
      mockStat.mockResolvedValue(makeStats({ size: 100 }));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await repo.listFolder('RUC1', '12345678', 'AT-001', '');
      await repo.listFolder('RUC1', '12345678', 'AT-001', 'sub');

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('read', () => {
    it('returns a NodeJS Readable stream from createReadStream at the full resolved path', async () => {
      const stream = new Readable({ read() {} });
      mockCreateReadStream.mockReturnValueOnce(stream);

      const result = await repo.read('RUC1', '12345678', 'AT-001', 'subfolder', 'informe.pdf');

      expect(result).toBe(stream);
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001\\subfolder\\informe.pdf',
      );
    });

    it('joins the path at the patient root when relativePath is empty', async () => {
      const stream = new Readable({ read() {} });
      mockCreateReadStream.mockReturnValueOnce(stream);

      await repo.read('RUC1', '12345678', 'AT-001', '', 'informe.pdf');

      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001\\informe.pdf',
      );
    });

    it('joins nested paths correctly (multi-level subfolder)', async () => {
      const stream = new Readable({ read() {} });
      mockCreateReadStream.mockReturnValueOnce(stream);

      await repo.read('RUC1', '12345678', 'AT-001', 'a/b/c', 'informe.pdf');

      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001\\a\\b\\c\\informe.pdf',
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

      await repo.listFolder('RUC1', '12345678', 'AT-001', '');

      expect(mockReaddir).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001',
      );
    });

    it('joins a subfolder to the patient root for nested listFolder calls', async () => {
      mockReaddir.mockResolvedValueOnce([]);

      await repo.listFolder('RUC1', '12345678', 'AT-001', 'subfolder/inner');

      expect(mockReaddir).toHaveBeenCalledWith(
        '\\\\172.16.10.12\\sigla\\RUC1\\12345678\\AT-001\\subfolder\\inner',
      );
    });
  });

  describe('port surface', () => {
    it('exposes listFolder and read but NOT list or stream (compile-time check)', () => {
      // Runtime sanity: the repo instance has the new methods.
      expect(typeof repo.listFolder).toBe('function');
      expect(typeof repo.read).toBe('function');
      expect(typeof (repo as unknown as { list?: unknown }).list).toBe('undefined');
      expect(typeof (repo as unknown as { stream?: unknown }).stream).toBe('undefined');
    });
  });
});

// Suppress unused-import warning — FileSystemNode is referenced
// indirectly through the production code's return type.
type _KeepFileSystemNode = FileSystemNode;
const _k: _KeepFileSystemNode | null = null;
void _k;
