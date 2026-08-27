import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock setup (sedes-route pattern at the @/lib/db boundary) ----

const mockRequestExecute = vi.hoisted(() => vi.fn());
const mockRequestInput = vi.hoisted(() => vi.fn());
const mockPoolConnect = vi.hoisted(() => vi.fn());
const mockGetSiglaReadOnlyPool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  getSiglaReadOnlyPool: mockGetSiglaReadOnlyPool,
}));

function createMockPool() {
  const mockRequest = {
    input: mockRequestInput.mockReturnThis(),
    execute: mockRequestExecute,
    query: vi.fn().mockResolvedValue({ recordset: [] }),
  };
  return {
    request: vi.fn(() => mockRequest),
    connect: mockPoolConnect.mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function bindValue(name: string): unknown {
  const call = mockRequestInput.mock.calls.find((c) => c[0] === name);
  if (!call) throw new Error(`bind ${name} not recorded`);
  return call[2];
}

function makeRequest(query = ''): Request {
  return new Request(`http://localhost/api/valoraciones/lookups/tipo${query}`);
}

function ctx(tipo: string): { params: Promise<{ tipo: string }> } {
  return { params: Promise.resolve({ tipo }) };
}

describe('GET /api/valoraciones/lookups/[tipo]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    __setValoracionesDbForTests(null);
  });

  it('clientes: returns 200 with mapped items for a valid q', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({
      recordset: [{ CodCli: 1, NomCom: 'EMPRESA A', NroRuc: '20511165181' }],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=empresa'), ctx('clientes'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      resultados: [{ codCli: 1, nomCom: 'EMPRESA A', nroRuc: '20511165181' }],
    });
    expect(bindValue('pat')).toBe('%empresa%');
  });

  it('clientes: wildcard-only q is escaped so it cannot match everything', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({ recordset: [] });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=%_'), ctx('clientes'));

    expect(res.status).toBe(200);
    // Bracket-escaped: no raw LIKE metacharacter survives.
    expect(bindValue('pat')).toBe('%[%][_]%');
  });

  it('clientes: q shorter than 2 chars → 400 without touching the pool', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=A'), ctx('clientes'));

    expect(res.status).toBe(400);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
    expect(mockRequestInput).not.toHaveBeenCalled();
  });

  it('clientes: missing q → 400', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeRequest(), ctx('clientes'));

    expect(res.status).toBe(400);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
  });

  it('pacientes: returns {codPac, nombre} items', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({
      recordset: [{ CodPer: 10000001, NroDId: '46145583', Nombre: 'CANCINO CUEVA NOELIA' }],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=CANCINO'), ctx('pacientes'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toEqual([
      { codPac: 10000001, nombre: 'CANCINO CUEVA NOELIA' },
    ]);
  });

  it('destinos: without codCli returns {resultados: []} and runs zero queries', async () => {
    const { GET } = await import('../route');

    const res = await GET(makeRequest(), ctx('destinos'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ resultados: [] });
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
  });

  it('destinos: with codCli=1 returns active destinations', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({
      recordset: [{ CodDes: 1657, DesDes: 'ADICIONALES' }],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest('?codCli=1'), ctx('destinos'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toEqual([{ codDes: 1657, desDes: 'ADICIONALES' }]);
    expect(bindValue('codCli')).toBe(1);
  });

  it('tipos-trabajador: returns the constants without params', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({
      recordset: [
        { CodCon: 620001, DesCon: 'OBRERO' },
        { CodCon: 620002, DesCon: 'EMPLEADO' },
      ],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest(), ctx('tipos-trabajador'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toEqual([
      { codTip: 620001, desTip: 'OBRERO' },
      { codTip: 620002, desTip: 'EMPLEADO' },
    ]);
  });

  it('sedes: queries VW_SEDE actives', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockResolvedValue({
      recordset: [{ CodSed: 1, NomSed: 'SEDE SURQUILLO' }],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest(), ctx('sedes'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toEqual([{ codSed: 1, nomSed: 'SEDE SURQUILLO' }]);
  });

  it('unknown tipo → 404 without touching the pool', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=abc'), ctx('monedas'));

    expect(res.status).toBe(404);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
  });

  it('repository failure → user-safe 500 (no SQL/table leakage)', async () => {
    const mockPool = createMockPool();
    mockPool.request().query = vi.fn().mockRejectedValue(
      new Error('Invalid object name \'Cliente\'.'),
    );
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeRequest('?q=empresa'), ctx('clientes'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('Cliente');
  });
});
