import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import {
  AtencionNotFoundError,
  DatasetNotFoundError,
  DataSourceUnavailableError,
  EdgeUnavailableError,
  MergeError,
  PrintError,
  TemplateError,
} from '@/features/musculoesqueletica-pdf/domain/errors';

const { mockService } = vi.hoisted(() => ({
  mockService: { generate: vi.fn() },
}));

vi.mock('@/features/musculoesqueletica-pdf/composition/container', () => ({
  buildPdfService: () => mockService,
}));

const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4

function params(idAten: string) {
  return { params: Promise.resolve({ idAten }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockService.generate.mockReset();
});

describe('GET /api/areas/musculoesqueletica/jjc/[idAten]/pdf', () => {
  it('returns a 200 application/pdf attachment for a successful generation', async () => {
    mockService.generate.mockResolvedValue(PDF_BYTES);

    const res = await GET(new Request('http://localhost/api/x/1/pdf'), params('123456'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="musculoesqueletica-jjc-123456.pdf"',
    );
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PDF_BYTES));
    expect(mockService.generate).toHaveBeenCalledWith('123456');
  });

  it('returns 400 for a missing idAten', async () => {
    const res = await GET(new Request('http://localhost/api/x/pdf'), params(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'idAtencion_required' });
    expect(mockService.generate).not.toHaveBeenCalled();
  });

  it('maps a missing atencion to 404 atencion_not_found without a PDF', async () => {
    mockService.generate.mockRejectedValue(new AtencionNotFoundError('nope'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'atencion_not_found' });
  });

  it('maps a missing dataset to 404 data_not_found', async () => {
    mockService.generate.mockRejectedValue(new DatasetNotFoundError('nope'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'data_not_found' });
  });

  it('maps a database loader failure to 502 database_unavailable', async () => {
    mockService.generate.mockRejectedValue(new DataSourceUnavailableError('db down'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'database_unavailable' });
  });

  it('maps an unavailable Edge browser to 502 edge_unavailable', async () => {
    mockService.generate.mockRejectedValue(new EdgeUnavailableError('no edge'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'edge_unavailable' });
  });

  it('maps a print failure to 502 edge_unavailable', async () => {
    mockService.generate.mockRejectedValue(new PrintError('pdf boom'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'edge_unavailable' });
  });

  it('maps a template/render failure to 500 internal_error', async () => {
    mockService.generate.mockRejectedValue(new TemplateError('bad token'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });

  it('maps a merge failure to 500 internal_error', async () => {
    mockService.generate.mockRejectedValue(new MergeError('merge boom'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });

  it('maps unexpected failures to 500 internal_error', async () => {
    mockService.generate.mockRejectedValue(new Error('boom'));
    const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
  });

  it('never returns a partial PDF: every error response is JSON without clinical data', async () => {
    for (const err of [
      new AtencionNotFoundError('nope'),
      new DatasetNotFoundError('nope'),
      new DataSourceUnavailableError('db down'),
      new EdgeUnavailableError('no edge'),
      new PrintError('boom'),
      new TemplateError('boom'),
      new MergeError('boom'),
    ]) {
      mockService.generate.mockRejectedValue(err);
      const res = await GET(new Request('http://localhost/api/x/9/pdf'), params('9'));
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = await res.json();
      expect(body).not.toHaveProperty('pdf');
      expect(body).not.toHaveProperty('paciente');
      expect(body).not.toHaveProperty('dni');
      expect(body).not.toHaveProperty('data');
    }
  });
});