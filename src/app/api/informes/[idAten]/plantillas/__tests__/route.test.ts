import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock setup ----

const mockRequestExecute = vi.hoisted(() => vi.fn());
const mockRequestInput = vi.hoisted(() => vi.fn());
const mockPoolConnect = vi.hoisted(() => vi.fn());
const mockGetPool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  getPool: mockGetPool,
}));

function createMockPool() {
  const mockRequest = {
    input: mockRequestInput.mockReturnThis(),
    execute: mockRequestExecute,
  };
  return {
    request: vi.fn(() => mockRequest),
    connect: mockPoolConnect.mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/informes/[idAten]/plantillas', () => {
  // ---- Happy path: 5 rows, sorted by ordPri ----

  it('should return 200 with a PlantillaRow[] sorted by ordPri', async () => {
    const spRows = [
      { CodPMe: 100, ArcPla: 'exa_aud', OrdPri: 5, IdePMe: 39056, IdeFMe: null },
      { CodPMe: 101, ArcPla: 'exa_lab', OrdPri: 1, IdePMe: 39053, IdeFMe: 2 },
      { CodPMe: 102, ArcPla: 'exa_rx', OrdPri: 3, IdePMe: 39054, IdeFMe: null },
      { CodPMe: 103, ArcPla: 'exa_ekg', OrdPri: 2, IdePMe: 39055, IdeFMe: null },
      { CodPMe: 104, ArcPla: 'exa_psico', OrdPri: 4, IdePMe: 39057, IdeFMe: null },
    ];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: spRows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(5);

    const ordPriSequence = body.map((row: { ordPri: number }) => row.ordPri);
    expect(ordPriSequence).toEqual([1, 2, 3, 4, 5]);

    // Sanity-check the shape of one row
    expect(body[0]).toEqual({
      codPMe: 101,
      arcPla: 'exa_lab',
      ordPri: 1,
      idePMe: 39053,
      ideFMe: 2,
    });
  });

  // ---- Regression: EmiAfi / IncExp from the query string are forwarded to the SP ----
  // Bug fix 2026-06-18: the route used to hard-code `EmiAfi=0 / IncExp=1`
  // in the mssql call while the client hooks defaulted to `1 / 0`. The
  // SP only returns IdePMe 39183 for `0 / 1`, so the checklist never
  // matched what the generar call sent. This test pins the contract:
  // whatever the client sends MUST reach the SP unmodified.

  it('should forward emiAfi=0, incExp=1 to the SP when the query string says so', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110057/plantillas?codCli=3331&emiAfi=0&incExp=1',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110057' }) });

    expect(mockRequestInput).toHaveBeenCalledWith('EmiAfi', expect.anything(), 0);
    expect(mockRequestInput).toHaveBeenCalledWith('IncExp', expect.anything(), 1);
  });

  it('should forward emiAfi=1, incExp=0 to the SP when the query string says so', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(mockRequestInput).toHaveBeenCalledWith('EmiAfi', expect.anything(), 1);
    expect(mockRequestInput).toHaveBeenCalledWith('IncExp', expect.anything(), 0);
  });

  // ---- NULL codDCo -> SP receives literal 'NULL' ----

  it('should serialise a null codDCo as the literal string "NULL" in the SP call', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    // Note: no `codDCo` query param at all.
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(mockRequestInput).toHaveBeenCalledWith('CodDCo', expect.anything(), 'NULL');
  });

  it('should serialise a numeric codDCo as a numeric string in the SP call', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0&codDCo=76',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(mockRequestInput).toHaveBeenCalledWith('CodDCo', expect.anything(), '76');
  });

  it('should also accept the literal string "null" for codDCo and serialise it as "NULL"', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0&codDCo=null',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(mockRequestInput).toHaveBeenCalledWith('CodDCo', expect.anything(), 'NULL');
  });

  // ---- Validation errors ----

  it('should return 400 when idAten is non-digit', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/abc/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: 'abc' }) });
    expect(res.status).toBe(400);
  });

  it('should return 400 when codCli is non-digit', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=abc&emiAfi=1&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(400);
  });

  it('should return 400 when emiAfi is non-digit', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=x&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(400);
  });

  it('should return 400 when incExp is non-digit', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(400);
  });

  it('should return 400 when codDCo is provided but non-numeric', async () => {
    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0&codDCo=xx',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(400);
  });

  // ---- Empty result -> 200 with [] ----

  it('should return 200 with an empty array when the SP returns zero rows', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  // ---- DB error -> 500 ----

  it('should return 500 with a user-safe error on SP failure', async () => {
    mockGetPool.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/plantillas?codCli=3331&emiAfi=1&incExp=0',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).not.toContain('ETIMEDOUT');
  });
});
