import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

function makeMockRepo(overrides: {
  read?: ReturnType<typeof vi.fn<() => Promise<NodeJS.ReadableStream>>>;
} = {}): IFileRepository {
  const readFn =
    overrides.read ?? vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue({} as NodeJS.ReadableStream);
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: readFn,
  };
}

describe('GET /api/files/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __setFileRepositoryForTests(makeMockRepo());
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 200 with the file stream and Content-Disposition: inline when the file exists', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="informe.pdf"');
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(mockRead).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', '', 'informe.pdf');
  });

  it('uses Content-Type: text/plain; charset=utf-8 for .txt files', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=reporte.txt',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="reporte.txt"');
  });

  it('uses Content-Type: image/jpeg for .jpg files', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=foto.jpg',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('uses Content-Type: image/png for .png files', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=logo.png',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('passes the ?path= argument to the repository for subfolder previews', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&path=subfolder%2Finner&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockRead).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', 'subfolder/inner', 'informe.pdf');
  });

  it('NEVER returns Content-Disposition: attachment (attachment is reserved for /download)', async () => {
    const fakeStream = new Readable({ read() {} });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue(fakeStream);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition.startsWith('inline')).toBe(true);
    expect(disposition.startsWith('attachment')).toBe(false);
  });

  it('returns 400 when filename is missing', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when ruc/dni/idAten are missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/preview?filename=informe.pdf');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when dni contains non-digit characters', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12abc45678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on path traversal in ?path=', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&path=..%2F..%2Fetc&filename=foo',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 400 on path traversal in ?filename=', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=..%2Fetc%2Fpasswd',
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 404 when the adapter throws ENOENT', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
  });

  it('returns 502 on non-ENOENT adapter errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const mockRead = vi.fn<() => Promise<NodeJS.ReadableStream>>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/preview?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
    const res = await GET(req);

    expect(res.status).toBe(502);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
