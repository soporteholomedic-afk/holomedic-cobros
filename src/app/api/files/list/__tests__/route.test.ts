import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { FileEntry, IFileRepository } from '@/features/envio-resultados/domain/ports';

function makeMockRepo(overrides: { list?: ReturnType<typeof vi.fn<() => Promise<FileEntry[]>>> } = {}): IFileRepository {
  const listFn = overrides.list ?? vi.fn<() => Promise<FileEntry[]>>().mockResolvedValue([]);
  return {
    list: listFn as IFileRepository['list'],
    stream: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

describe('GET /api/files/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 200 with the file list from the repository', async () => {
    const files: FileEntry[] = [
      { name: 'informe.pdf', sizeBytes: 1234, modifiedAt: '2026-06-01T00:00:00.000Z' },
      { name: 'foto.jpg', sizeBytes: 5678, modifiedAt: '2026-06-02T00:00:00.000Z' },
    ];
    const mockList = vi.fn().mockResolvedValue(files);
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=20123456789&dni=12345678&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: FileEntry[] };
    expect(body.files).toEqual(files);
    expect(mockList).toHaveBeenCalledWith('20123456789', '12345678', 'AT-001');
  });

  it('returns 200 with empty files when the repo returns []', async () => {
    const mockList = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=RUC&dni=1&idAten=A');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: FileEntry[] };
    expect(body.files).toEqual([]);
  });

  it('returns 400 when ruc is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?dni=12345678&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('parámetros');
  });

  it('returns 400 when dni is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=RUC&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when idAten is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=RUC&dni=12345678');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when ruc is present but empty', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=&dni=12345678&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when dni contains non-digit characters', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=RUC&dni=12abc45678&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('dni');
  });

  it('returns 502 when the repository throws', async () => {
    const mockList = vi.fn().mockRejectedValue(new Error('share unreachable'));
    __setFileRepositoryForTests(makeMockRepo({ list: mockList }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/files/list?ruc=RUC&dni=12345678&idAten=AT-001');
    const res = await GET(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('servidor de archivos');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
