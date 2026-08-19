import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFileNode,
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

describe('POST /api/files/check-legajos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 200 with status mapped by idAten when files are checked successfully', async () => {
    const mockListFolder = vi.fn<IFileRepository['listFolder']>().mockImplementation(async (ruc, dni, idAten, path) => {
      expect(path).toBe('LEGAJOS');
      if (idAten === 'ATE-001') {
        return [
          createFileNode({ name: '123456CERT.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
          createFileNode({ name: 'other.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
        ];
      }
      if (idAten === 'ATE-002') {
        return [
          createFileNode({ name: '987654EXPED.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
        ];
      }
      if (idAten === 'ATE-003') {
        return [
          createFileNode({ name: '111111CERT.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
          createFileNode({ name: '222222EXPED.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
        ];
      }
      return [];
    });

    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify([
        { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
        { ruc: '20123456789', dni: '87654321', idAten: 'ATE-002' },
        { ruc: '20123456789', dni: '11111111', idAten: 'ATE-003' },
        { ruc: '20123456789', dni: '22222222', idAten: 'ATE-004' },
      ]),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      'ATE-001': { hasCamo: true, hasEmo: false },
      'ATE-002': { hasCamo: false, hasEmo: true },
      'ATE-003': { hasCamo: true, hasEmo: true },
      'ATE-004': { hasCamo: false, hasEmo: false },
    });
  });

  it('handles case insensitivity for filename matches', async () => {
    const mockListFolder = vi.fn<IFileRepository['listFolder']>().mockResolvedValue([
      createFileNode({ name: '123456cert.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
      createFileNode({ name: '987654exped.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify([
        { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
      ]),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      'ATE-001': { hasCamo: true, hasEmo: true },
    });
  });

  it('captures errors for individual patient checks without crashing the whole request', async () => {
    const mockListFolder = vi.fn<IFileRepository['listFolder']>().mockImplementation(async (ruc, dni, idAten) => {
      if (idAten === 'ATE-FAIL') {
        throw new Error('Connection timed out');
      }
      return [
        createFileNode({ name: '123456CERT.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
      ];
    });

    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify([
        { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
        { ruc: '20123456789', dni: '87654321', idAten: 'ATE-FAIL' },
      ]),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body['ATE-001']).toEqual({ hasCamo: true, hasEmo: false });
    expect(body['ATE-FAIL'].hasCamo).toBe(false);
    expect(body['ATE-FAIL'].hasEmo).toBe(false);
    expect(body['ATE-FAIL'].error).toContain('Connection timed out');
  });

  it('returns 400 when request body is not an array', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify({ ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when parameters are missing', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify([
        { ruc: '20123456789', dni: '', idAten: 'ATE-001' },
      ]),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when dni is non-alphanumeric', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/files/check-legajos', {
      method: 'POST',
      body: JSON.stringify([
        { ruc: '20123456789', dni: '1234abc.8', idAten: 'ATE-001' },
      ]),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
