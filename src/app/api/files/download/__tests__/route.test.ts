import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock `node:fs` at the module boundary — the route uses `fs.promises.stat`
// and `fs.createReadStream` directly (the download path does not go through
// the repository because it needs the per-file stream, not the listing).
const mockStat = vi.hoisted(() => vi.fn());
const mockCreateReadStream = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => {
  const promises = { stat: mockStat };
  return {
    promises,
    createReadStream: mockCreateReadStream,
    default: { promises, createReadStream: mockCreateReadStream },
  };
});

vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

import { Readable } from 'node:stream';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

function makeMockRepo(): IFileRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    stream: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

describe('GET /api/files/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setFileRepositoryForTests(makeMockRepo());
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 400 when filename is missing', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when ruc/dni/idAten are missing', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?filename=informe.pdf',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when dni contains non-digit characters', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12abc45678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('dni');
  });

  it('returns 400 on Windows-style path traversal', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=..%5C..%5C..%5Cwindows%5Csam',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on POSIX-style path traversal', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=..%2F..%2Fetc%2Fpasswd',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the file does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockStat.mockRejectedValueOnce(err);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('no encontrado');
  });

  it('returns 502 on non-ENOENT stat errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mockStat.mockRejectedValueOnce(err);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(502);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 200 with the file stream and Content-Disposition when the file exists', async () => {
    mockStat.mockResolvedValueOnce({
      size: 4096,
      isFile: () => true,
      mtime: new Date('2026-01-01T00:00:00Z'),
    });
    const fakeStream = new Readable({ read() {} });
    mockCreateReadStream.mockReturnValueOnce(fakeStream);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="informe.pdf"');
    expect(res.headers.get('Content-Length')).toBe('4096');
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      '\\\\172.16.10.12\\sigla\\RUC\\12345678\\AT-001\\informe.pdf',
    );
  });

  it('warn-logs when a file is over 50 MB (cosmetic, no test of UI surface)', async () => {
    mockStat.mockResolvedValueOnce({
      size: 60 * 1024 * 1024,
      isFile: () => true,
      mtime: new Date('2026-01-01T00:00:00Z'),
    });
    const fakeStream = new Readable({ read() {} });
    mockCreateReadStream.mockReturnValueOnce(fakeStream);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=big.bin',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
