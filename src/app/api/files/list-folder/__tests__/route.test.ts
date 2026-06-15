import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFileNode,
  createFolderNode,
  type IFileRepository,
} from '@/features/envio-resultados/domain/ports';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';

function makeMockRepo(overrides: { listFolder?: ReturnType<typeof vi.fn<IFileRepository['listFolder']>> } = {}): IFileRepository {
  const listFolderFn = overrides.listFolder ?? vi.fn<IFileRepository['listFolder']>().mockResolvedValue([]);
  return {
    listFolder: listFolderFn,
    read: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

describe('GET /api/files/list-folder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 200 with sorted folders-first nodes from the repository', async () => {
    const nodes = [
      createFolderNode({ name: 'subdir' }),
      createFileNode({ name: 'informe.pdf', sizeBytes: 1234, modifiedAt: '2026-06-01T00:00:00.000Z' }),
      createFolderNode({ name: 'reports' }),
    ];
    const mockListFolder = vi.fn().mockResolvedValue(nodes);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=20123456789&dni=12345678&idAten=AT-001',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: unknown[] };
    expect(body.nodes).toHaveLength(3);
    expect(mockListFolder).toHaveBeenCalledWith('20123456789', '12345678', 'AT-001', '');
  });

  it('returns 200 with an empty nodes array when the repo returns []', async () => {
    const mockListFolder = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=1&idAten=A',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: unknown[] };
    expect(body.nodes).toEqual([]);
  });

  it('passes the ?path= argument to the repository for subfolder listings', async () => {
    const mockListFolder = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=1&idAten=A&path=subfolder',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockListFolder).toHaveBeenCalledWith('RUC', '1', 'A', 'subfolder');
  });

  it('returns 400 when ruc is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?dni=12345678&idAten=AT-001',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when dni is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&idAten=AT-001',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when idAten is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12345678',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('returns 400 when dni contains non-digit characters', async () => {
    __setFileRepositoryForTests(makeMockRepo());

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12abc45678&idAten=AT-001',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('dni');
  });

  it('returns 400 on path traversal in ?path= (POSIX `../etc`)', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12345678&idAten=AT-001&path=..%2F..%2Fetc',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 400 on path traversal in ?path= (Windows `..\\..\\Windows`)', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12345678&idAten=AT-001&path=..%5C..%5CWindows',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 502 when the repository throws (UNC unreachable)', async () => {
    const mockListFolder = vi.fn().mockRejectedValue(new Error('share unreachable'));
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12345678&idAten=AT-001',
    );
    const res = await GET(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('servidor de archivos');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('NEVER returns 404 (empty folder = 200 with empty nodes, not 404)', async () => {
    const mockListFolder = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/list-folder?ruc=RUC&dni=12345678&idAten=AT-001&path=empty-subfolder',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
  });
});
