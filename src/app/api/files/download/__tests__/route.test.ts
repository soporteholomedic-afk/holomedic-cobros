import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

/**
 * The download route delegates to `IFileRepository.read`; the test seam
 * injects a mock that records the call. ENOENT and I/O errors are
 * surfaced via the rejected promise.
 */
function makeMockRepo(overrides: { read?: ReturnType<typeof vi.fn<() => Promise<NodeJS.ReadableStream>>> } = {}): IFileRepository {
  const readFn = overrides.read ?? vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue({} as NodeJS.ReadableStream);
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: readFn,
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

  it('returns 404 when the adapter throws ENOENT', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('no encontrado');
  });

  it('returns 502 on non-ENOENT adapter errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));
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

  it('returns 200 with the file stream and Content-Disposition: attachment when the file exists', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="informe.pdf"');
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(mockRead).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', '', 'informe.pdf');
  });

  it('NEVER returns Content-Disposition: inline (the inline disposition is reserved for /preview)', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition.startsWith('inline')).toBe(false);
    expect(disposition.startsWith('attachment')).toBe(true);
  });

  describe('?path= subfolder support (PR-B1)', () => {
    it('passes the ?path= argument to the repository for subfolder downloads', async () => {
      const fakeStream = new Readable({ read() {} });
      const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
      __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

      const { GET } = await import('../route');
      const req = new Request(
        'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&path=subfolder%2Finner&filename=informe.pdf',
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="informe.pdf"');
      expect(mockRead).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', 'subfolder/inner', 'informe.pdf');
    });

    it('passes the empty string when ?path= is missing (root folder — existing behavior)', async () => {
      const fakeStream = new Readable({ read() {} });
      const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
      __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

      const { GET } = await import('../route');
      const req = new Request(
        'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockRead).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', '', 'informe.pdf');
    });

    it('returns 400 on path traversal in ?path=', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { GET } = await import('../route');
      const req = new Request(
        'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&path=..%2F..%2Fetc&filename=informe.pdf',
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns 400 on Windows-style path traversal in ?path=', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { GET } = await import('../route');
      const req = new Request(
        'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&path=..%5C..%5CWindows&filename=informe.pdf',
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('the Content-Disposition is STILL `attachment` when ?path= is used (NEVER inline)', async () => {
      const fakeStream = new Readable({ read() {} });
      const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
      __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

      const { GET } = await import('../route');
      const req = new Request(
        'http://localhost/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&path=subfolder&filename=informe.pdf',
      );
      const res = await GET(req);

      const disposition = res.headers.get('Content-Disposition') ?? '';
      expect(disposition.startsWith('attachment')).toBe(true);
      expect(disposition.startsWith('inline')).toBe(false);
    });
  });
});
