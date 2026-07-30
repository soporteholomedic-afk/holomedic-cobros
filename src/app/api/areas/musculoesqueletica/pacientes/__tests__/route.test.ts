import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequestFn = vi.fn();
const mockConnect = vi.fn();

const mockPool = {
  connect: mockConnect,
  request: () => ({
    input: vi.fn().mockReturnThis(),
    query: mockRequestFn,
  }),
};

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(() => Promise.resolve(mockPool)),
  getHolomedicPool: vi.fn(() => Promise.resolve(mockPool)),
}));

const mockRows = [
  {
    idAtencion: '01001000001',
    dni: '40123456',
    paciente: 'JUAN PEREZ',
    sexo: 'M',
    fechaNac: '15/01/1990',
    edad: 36,
    fechaAtencion: '21/07/2026',
    empresa: 'JJC CONTRATISTAS GENERALES S.A.',
    tipoExamen: 'OCUPACIONAL',
    puesto: 'OPERARIO',
  },
];

const evalRows = [{ idAtencion: '01001000001' }];

function createUrl(overrides: Record<string, string> = {}): URL {
  const defaults: Record<string, string> = { company: '149' };
  const params = new URLSearchParams({ ...defaults, ...overrides });
  return new URL(`http://localhost/api/areas/musculoesqueletica/pacientes?${params}`);
}

const { GET } = await import('../route');

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockRequestFn
    .mockResolvedValueOnce({ recordset: mockRows })
    .mockResolvedValueOnce({ recordset: evalRows });
});

describe('GET /api/areas/musculoesqueletica/pacientes', () => {
  it('returns 200 with enriched rows when query succeeds', async () => {
    const req = new Request(createUrl());

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].hasEvaluacion).toBe(true);
    expect(body[0].paciente).toBe('JUAN PEREZ');
  });

  it('returns 400 when company param is missing', async () => {
    const url = new URL('http://localhost/api/areas/musculoesqueletica/pacientes');
    const req = new Request(url);

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('company');
  });

  it('returns 400 when company is not a valid integer', async () => {
    const req = new Request(createUrl({ company: 'abc' }));

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('entero');
  });

  it('returns 400 when fechaInicio is not YYYY-MM-DD', async () => {
    const req = new Request(createUrl({ fechaInicio: '01-01-2026' }));

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('YYYY-MM-DD');
  });

  it('returns 400 when fechaFin is not YYYY-MM-DD', async () => {
    const req = new Request(createUrl({ fechaFin: 'bad-date' }));

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('YYYY-MM-DD');
  });

  it('returns 400 when fechaInicio > fechaFin', async () => {
    const req = new Request(createUrl({ fechaInicio: '2026-12-31', fechaFin: '2026-01-01' }));

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('inicio');
  });

  it('defaults fechaInicio and fechaFin to today when not provided', async () => {
    const req = new Request(createUrl({ fechaInicio: '', fechaFin: '' }));

    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it('returns 500 when DB query throws', async () => {
    mockRequestFn.mockReset();
    mockRequestFn.mockRejectedValueOnce(new Error('DB connection failed'));

    const req = new Request(createUrl());

    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Error al consultar');
  });

  it('gracefully falls back when HOLOMEDIC eval query throws', async () => {
    mockRequestFn.mockReset();
    mockRequestFn
      .mockResolvedValueOnce({ recordset: mockRows })
      .mockRejectedValueOnce(new Error('HOLOMEDIC unreachable'));

    const req = new Request(createUrl());

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].hasEvaluacion).toBe(false);
  });
});
