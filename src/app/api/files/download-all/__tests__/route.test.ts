import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock `node:fs.createReadStream` so the route never tries to open a
// real file in tests — archiver pulls from the stream asynchronously
// and an ENOENT would leak as an uncaught exception after the test
// completes.
const mockCreateReadStream = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => {
  const promises = {};
  return {
    promises,
    createReadStream: mockCreateReadStream,
    default: { promises, createReadStream: mockCreateReadStream },
  };
});

vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { FileEntry, IFileRepository } from '@/features/envio-resultados/domain/ports';

function makeMockRepo(overrides: { list?: ReturnType<typeof vi.fn<() => Promise<FileEntry[]>>> } = {}): IFileRepository {
  const listFn = overrides.list ?? vi.fn<() => Promise<FileEntry[]>>().mockResolvedValue([]);
  return {
    list: listFn as IFileRepository['list'],
    stream: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

function emptyReadable() {
  return new Readable({ read() {} });
}

beforeEach(() => {
  mockCreateReadStream.mockReset();
  mockCreateReadStream.mockImplementation(() => emptyReadable());
});

describe('GET /api/files/download-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 400 when ruc/dni/idAten are missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/download-all');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when dni contains non-digit characters', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12abc45678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 502 when the repository list call throws', async () => {
    const mockList = vi.fn().mockRejectedValue(new Error('share unreachable'));
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(502);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 200 with a zip stream and sanitized filename for a populated folder', async () => {
    const files: FileEntry[] = [
      { name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const mockList = vi.fn().mockResolvedValue(files);
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Juan - 12345678 - Acme.zip"',
    );
  });

  it('returns 200 with a zip stream and an empty-folder filename when there are no files', async () => {
    const mockList = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Juan - 12345678 - Acme.zip"',
    );
  });

  it('sanitizes illegal characters in the zip filename (slashes, brackets)', async () => {
    const mockList = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan%2FP%C3%A9rez&empresa=Acme%3CCorp%3E',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Juan_Pérez - 12345678 - Acme_Corp_.zip"',
    );
  });
});
