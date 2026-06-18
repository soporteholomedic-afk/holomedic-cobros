import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock setup: mssql + db pool ----
// Mirrors the pattern in
// `src/app/api/consolidados/results/__tests__/route.test.ts` so
// future contributors see one shape across all SP-backed routes.

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

describe('GET /api/informes/[idAten]/lookup', () => {
  // ---- Happy path: row found ----

  it('should return 200 with a normalised InformeNoCerradoRow when the SP returns one row', async () => {
    const spRows = [
      {
        IdAten: '012110021',
        CodEmp: 1,
        CodSed: 1,
        CodTCl: 2,
        NumOrd: 100200,
        FecAte: '17/06/2026',
        CodCli: 3331,
        CodDCo: 76,
      },
    ];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: spRows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110021/lookup?fecAte=17%2F06%2F2026',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110021' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      idAten: '012110021',
      codEmp: 1,
      codSed: 1,
      codTCl: 2,
      numOrd: 100200,
      fecAte: '17/06/2026',
      codCli: 3331,
      codDCo: 76,
    });
  });

  // ---- SP returns 0 rows -> 404 ----

  it('should return 404 with NOT_FOUND when the SP returns zero rows', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/999999999/lookup?fecAte=17%2F06%2F2026',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '999999999' }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toContain('999999999');
    expect(body.message).toContain('17/06/2026');
  });

  // ---- Non-digit idAten -> 400 ----

  it('should return 400 when idAten contains non-digit characters', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/informes/../etc/lookup?fecAte=17%2F06%2F2026');
    const res = await GET(req, { params: Promise.resolve({ idAten: '../etc' }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ---- Missing/malformed fecAte -> 400 ----

  it('should return 400 when fecAte is missing or has the wrong format', async () => {
    const { GET } = await import('../route');

    // Missing entirely
    const r1 = await GET(new Request('http://localhost/api/informes/12345/lookup'), {
      params: Promise.resolve({ idAten: '12345' }),
    });
    expect(r1.status).toBe(400);

    // Wrong format (ISO instead of dd/MM/yyyy)
    const r2 = await GET(new Request('http://localhost/api/informes/12345/lookup?fecAte=2026-06-17'), {
      params: Promise.resolve({ idAten: '12345' }),
    });
    expect(r2.status).toBe(400);
  });

  // ---- NULL codCli/codDCo -> response with `null` ----

  it('should preserve NULL codCli and codDCo from the SP as `null` in the response', async () => {
    const spRows = [
      {
        IdAten: '012110022',
        CodEmp: 1,
        CodSed: 1,
        CodTCl: 2,
        NumOrd: 100201,
        FecAte: '17/06/2026',
        CodCli: null,
        CodDCo: null,
      },
    ];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: spRows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110022/lookup?fecAte=17%2F06%2F2026',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '012110022' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.codCli).toBeNull();
    expect(body.codDCo).toBeNull();
  });

  // ---- WHERE clause composition ----

  it('should compose the WHERE filter from the validated fecAte and the configured CodSed', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/012110023/lookup?fecAte=09%2F06%2F2026',
    );
    await GET(req, { params: Promise.resolve({ idAten: '012110023' }) });

    // The filter arg receives the operator date in `dd/MM/yyyy` but
    // must embed it as `yyyy-MM-dd` so SQL Server parses it as ISO-8601
    // regardless of the connection's DATEFORMAT/language settings.
    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHERE',
      expect.anything(),
      expect.stringContaining("FecAte >= '2026-06-09'"),
    );
    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHERE',
      expect.anything(),
      expect.stringContaining("FecAte < DATEADD(DD,1,'2026-06-09')"),
    );
    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHERE',
      expect.anything(),
      expect.stringContaining("CodSed = '1'"),
    );
    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHERE',
      expect.anything(),
      expect.stringContaining('IdAten = 012110023'),
    );
    expect(mockRequestInput).toHaveBeenCalledWith('ORDER', expect.anything(), 'FecAte DESC');
    expect(mockRequestInput).toHaveBeenCalledWith('TipEva', expect.anything(), 4);
  });

  // ---- Unexpected error -> 500 ----

  it('should return 500 with a user-safe error on pool connection failure', async () => {
    mockGetPool.mockRejectedValueOnce(new Error('Failed to connect to 172.16.10.14:1433'));

    const { GET } = await import('../route');
    const req = new Request(
      'http://localhost/api/informes/12345/lookup?fecAte=17%2F06%2F2026',
    );
    const res = await GET(req, { params: Promise.resolve({ idAten: '12345' }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
    // User-safe: no raw connection details leak.
    expect(body.message).not.toContain('172.16.10.14');
  });
});
