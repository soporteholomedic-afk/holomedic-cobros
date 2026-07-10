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
import {
  createFileNode,
  createFolderNode,
  type FileSystemNode,
  type IFileRepository,
} from '@/features/envio-resultados/domain/ports';

function makeMockRepo(
  overrides: { listFolder?: ReturnType<typeof vi.fn<IFileRepository['listFolder']>> } = {},
): IFileRepository {
  const listFolderFn = overrides.listFolder ?? vi.fn<IFileRepository['listFolder']>().mockResolvedValue([]);
  return {
    listFolder: listFolderFn,
    read: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

function emptyReadable() {
  return new Readable({ read() {} });
}

beforeEach(() => {
  mockCreateReadStream.mockReset();
  mockCreateReadStream.mockImplementation(() => emptyReadable());
});

// ---- Shared helpers ----

const BASE_URL = '\\\\172.16.10.12\\sigla';

// ---- GET tests ----

describe('GET /api/files/download-all (backward compat)', () => {
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

  it('returns 502 when BOTH listFolder calls throw', async () => {
    const mockListFolder = vi.fn().mockRejectedValue(new Error('share unreachable'));
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));
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

  it('returns 200 when only one listFolder (root) succeeds and LEGAJOS fails', async () => {
    const mockListFolder = vi
      .fn<IFileRepository['listFolder']>()
      .mockImplementation((_ruc, _dni, _idAten, relativePath: string) => {
        if (relativePath === '') return Promise.resolve([]);
        return Promise.reject(new Error('LEGAJOS unreachable'));
      });
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    warnSpy.mockRestore();
  });

  it('includes files from both root and LEGAJOS', async () => {
    const mockListFolder = vi
      .fn<IFileRepository['listFolder']>()
      .mockImplementation((_ruc, _dni, _idAten, relativePath: string) => {
        if (relativePath === 'LEGAJOS') {
          return Promise.resolve([
            createFileNode({ name: '012110429CERT.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' }),
          ] as FileSystemNode[]);
        }
        return Promise.resolve([
          createFileNode({ name: 'informe.pdf', sizeBytes: 200, modifiedAt: '2026-01-01T00:00:00.000Z' }),
        ] as FileSystemNode[]);
      });
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    await GET(req);

    // One call for root, one for LEGAJOS
    expect(mockListFolder).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', '');
    expect(mockListFolder).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', 'LEGAJOS');
    // Both files should be streamed
    expect(mockCreateReadStream).toHaveBeenCalledTimes(2);
  });

  it('returns 200 with a zip stream and sanitized filename for a populated folder', async () => {
    const rootNodes = [
      createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const legajosNodes: FileSystemNode[] = [];
    const mockListFolder = vi
      .fn<IFileRepository['listFolder']>()
      .mockImplementation((_ruc, _dni, _idAten, relativePath: string) => {
        return relativePath === 'LEGAJOS' ? Promise.resolve(legajosNodes) : Promise.resolve(rootNodes);
      });
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

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

  it('returns 200 with a zip stream and sanitized filename when there are no files', async () => {
    const mockListFolder = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Juan - 12345678 - Acme.zip"',
    );
  });

  it('sanitizes illegal characters in the zip filename (slashes, brackets)', async () => {
    const mockListFolder = vi.fn().mockResolvedValue([]);
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

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

  it('skips folders in the listing (only files go into the zip)', async () => {
    const rootNodes: FileSystemNode[] = [
      createFolderNode({ name: 'subdir' }),
      createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const legajosNodes: FileSystemNode[] = [];
    const mockListFolder = vi
      .fn<IFileRepository['listFolder']>()
      .mockImplementation((_ruc, _dni, _idAten, relativePath: string) => {
        return relativePath === 'LEGAJOS' ? Promise.resolve(legajosNodes) : Promise.resolve(rootNodes);
      });
    __setFileRepositoryForTests(makeMockRepo({ listFolder: mockListFolder }));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/files/download-all?ruc=RUC&dni=12345678&idAten=AT-001&nombrePaciente=Juan&empresa=Acme',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    // One file from root, zero from LEGAJOS
    expect(mockCreateReadStream).toHaveBeenCalledTimes(1);
  });
});

// ---- POST tests ----

describe('POST /api/files/download-all (selection-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns 400 when ruc/dni/idAten are missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('fileRefs', '[]');
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileRefs is missing', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty zip when fileRefs is an empty array', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    formData.append('nombrePaciente', 'Juan');
    formData.append('empresa', 'Acme');
    formData.append('destino', '');
    formData.append('fileRefs', '[]');
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Juan - 12345678 - Acme.zip"',
    );
    // No createReadStream calls (no files selected)
    expect(mockCreateReadStream).not.toHaveBeenCalled();
  });

  it('returns 400 when fileRefs JSON is malformed', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    formData.append('fileRefs', 'not-json');
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileRefs is not an array', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    formData.append('fileRefs', '{"ruc":"RUC"}');
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileRefs contains a malformed ref', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    formData.append('fileRefs', JSON.stringify([{ ruc: 'RUC' }])); // missing fields
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when fileRefs have mismatched ruc/dni/idAten', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const formData = new FormData();
    formData.append('ruc', 'RUC');
    formData.append('dni', '12345678');
    formData.append('idAten', 'AT-001');
    formData.append(
      'fileRefs',
      JSON.stringify([
        { ruc: 'RUC', dni: '87654321', idAten: 'AT-001', path: '', name: 'a.pdf' },
      ]),
    );
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('streams a renamed ready file for a selected CERT ref with nombre and destino', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const fd = new FormData();
    fd.append('ruc', 'RUC');
    fd.append('dni', '12345678');
    fd.append('idAten', 'AT-001');
    fd.append('nombrePaciente', 'JUAN PEREZ');
    fd.append('empresa', 'Acme');
    fd.append('destino', 'UNACEM');
    fd.append(
      'fileRefs',
      JSON.stringify([
        { ruc: 'RUC', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: '012110429CERT.pdf' },
      ]),
    );
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: fd });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="JUAN PEREZ - 12345678 - Acme.zip"',
    );
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      `${BASE_URL}\\RUC\\12345678\\AT-001\\LEGAJOS\\012110429CERT.pdf`,
    );
  });

  it('streams multiple selected files from different paths', async () => {
    __setFileRepositoryForTests(makeMockRepo());
    const { POST } = await import('../route');
    const fd = new FormData();
    fd.append('ruc', 'RUC');
    fd.append('dni', '12345678');
    fd.append('idAten', 'AT-001');
    fd.append('nombrePaciente', '');
    fd.append('empresa', 'Acme');
    fd.append('destino', '');
    fd.append(
      'fileRefs',
      JSON.stringify([
        { ruc: 'RUC', dni: '12345678', idAten: 'AT-001', path: '', name: 'informe.pdf' },
        { ruc: 'RUC', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: '012345CERT.pdf' },
      ]),
    );
    const req = new Request('http://localhost/api/files/download-all', { method: 'POST', body: fd });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockCreateReadStream).toHaveBeenCalledTimes(2);
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      `${BASE_URL}\\RUC\\12345678\\AT-001\\informe.pdf`,
    );
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      `${BASE_URL}\\RUC\\12345678\\AT-001\\LEGAJOS\\012345CERT.pdf`,
    );
  });
});
