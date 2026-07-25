import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JjcEvaluacion } from '@/types/jjc';

// ---- Mocks ----

const mockSaveExecute = vi.fn();
const mockLoadExecute = vi.fn();

vi.mock('@/features/jjc-mapper/composition/container', () => ({
  buildSaveJjcEvaluacion: () => ({ execute: mockSaveExecute }),
  buildLoadJjcEvaluacion: () => ({ execute: mockLoadExecute }),
}));

const mockGetSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test ----

const { POST, GET } = await import('../route');

// ---- Helpers ----

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/areas/medicina/jjc/evaluaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createGetRequest(query: string): Request {
  return new Request(`http://localhost/api/areas/medicina/jjc/evaluaciones?${query}`, {
    method: 'GET',
  });
}

function createInvalidJsonRequest(): Request {
  return new Request('http://localhost/api/areas/medicina/jjc/evaluaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
}

const sampleEval: JjcEvaluacion = {
  idAtencion: '01001000001',
  fechaEvaluacion: '2026-07-20',
  lugar: 'HOLOMEDIC',
  fototipo: 'III-IV',
  fotoprotector: 'FPS recomendado +65',
  observaciones: '',
  lesiones: [],
  preguntas: null,
  createdBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ sub: 'user-001', nombre: 'Dr. Prueba', area: 'medicina', permisos: ['jjc'] });
});

// ---- POST ----

describe('POST /api/areas/medicina/jjc/evaluaciones', () => {
  it('returns 201 when save succeeds (new evaluation)', async () => {
    mockSaveExecute.mockResolvedValue({ ok: true });

    const res = await POST(createJsonRequest({
      idAtencion: '01001000001',
      fechaEvaluacion: '2026-07-20',
      fototipo: 'III-IV',
      observaciones: '',
      lesiones: [],
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, id: '01001000001' });
  });

  it('returns 400 when validation fails', async () => {
    mockSaveExecute.mockResolvedValue({ ok: false, error: 'fototipo es requerido' });

    const res = await POST(createJsonRequest({
      idAtencion: '01001000001',
      fechaEvaluacion: '2026-07-20',
      fototipo: null,
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('fototipo es requerido');
  });

  it('returns 500 when save throws', async () => {
    mockSaveExecute.mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(createJsonRequest({
      idAtencion: '01001000001',
      fechaEvaluacion: '2026-07-20',
      fototipo: 'I-II',
    }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB connection failed');
  });

  it('returns 500 on JSON parse error', async () => {
    const res = await POST(createInvalidJsonRequest());
    expect(res.status).toBe(500);
  });
});

// ---- GET ----

describe('GET /api/areas/medicina/jjc/evaluaciones', () => {
  it('returns 200 with evaluation data when found', async () => {
    mockLoadExecute.mockResolvedValue({ ok: true, data: sampleEval, error: null });

    const res = await GET(createGetRequest('idAtencion=01001000001'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(sampleEval);
  });

  it('returns 404 when evaluation not found', async () => {
    mockLoadExecute.mockResolvedValue({ ok: true, data: null, error: null });

    const res = await GET(createGetRequest('idAtencion=01001000001'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Evaluación no encontrada');
    expect(body.data).toBeNull();
  });

  it('returns 400 when idAtencion is missing', async () => {
    const res = await GET(createGetRequest(''));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('idAtencion');
  });

  it('returns 500 when load throws', async () => {
    mockLoadExecute.mockRejectedValue(new Error('DB error'));

    const res = await GET(createGetRequest('idAtencion=01001000001'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB error');
  });

  it('returns 500 when use case returns error', async () => {
    mockLoadExecute.mockResolvedValue({ ok: false, data: null, error: 'Repo error' });

    const res = await GET(createGetRequest('idAtencion=01001000001'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Repo error');
  });
});
