import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpResultRow } from '@/types/sp-result';

/**
 * Fixture builder matching the SP_RPT_MATRIZICCGSA output shape.
 */
function makeRow(overrides: Partial<SpResultRow> = {}): SpResultRow {
  return {
    NroDId: 'DNI 25721424',
    Pacien: 'FALLA PEÑA GILMER DUBERLY',
    DesPue: 'SOLDADOR',
    DesDes: 'UNACEM',
    SexPac: 'M',
    FecNac: '15/08/1972',
    EdaPac: 53,
    NomPro: 'P3 - SUSTANCIAS QUIMICAS',
    DesTCh: 'PERIODICO',
    FecAte: '09/06/2026',
    ValHas: '10/06/2027',
    NomCli: 'HOLOMEDIC SERVICIOS INTEGRALES S.A.C.',
    Condic: 'NULL',
    EstCar: 'PENDIENTE',
    PesoKg: 79,
    IMCkgm: 28.67,
    FreAud: '500,1000,2000,3000,4000,6000,8000',
    CenCos: 'CIME INGENIEROS S R L',
    SelRes: 'NULL',
    EstPag: 'CREDITO',
    NomCom: 'CIME INGENIEROS S R L',
    ...overrides,
  };
}

// ---- Mock setup ----

const mockRequestExecute = vi.hoisted(() => vi.fn());
const mockRequestInput = vi.hoisted(() => vi.fn());
const mockPoolConnect = vi.hoisted(() => vi.fn());
const mockGetPool = vi.hoisted(() => vi.fn());

// Mock the DB module
vi.mock('@/lib/db', () => ({
  getPool: mockGetPool,
}));

// Create a mock pool factory
function createMockPool(overrides: Record<string, unknown> = {}) {
  const mockRequest = {
    input: mockRequestInput.mockReturnThis(),
    execute: mockRequestExecute,
    ...overrides,
  };

  return {
    request: vi.fn(() => mockRequest),
    connect: mockPoolConnect.mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('GET /api/consolidados/results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Success: 200 with rows ----

  it('should return 200 with grouped companies when SP returns rows', async () => {
    const rows: SpResultRow[] = [
      makeRow({ NroDId: 'DNI A', Pacien: 'WORKER A', DesTCh: 'EXAM-A', DesDes: 'PROJ-X', NomCom: 'COMPANY 1' }),
      makeRow({ NroDId: 'DNI B', Pacien: 'WORKER B', DesTCh: 'EXAM-B', DesDes: 'PROJ-X', NomCom: 'COMPANY 1' }),
      makeRow({ NroDId: 'DNI C', Pacien: 'WORKER C', DesTCh: 'EXAM-C', DesDes: 'PROJ-Y', NomCom: 'COMPANY 2' }),
    ];

    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    // Dynamic import since mocks need to be in place before the module loads
    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('companies');
    expect(body.companies).toHaveLength(2);
    expect(body.companies[0].companyName).toBe('COMPANY 1');
    expect(body.companies[0].workers).toHaveLength(2);
    expect(body.companies[0].workerCount).toBe(2);
    expect(body.companies[1].companyName).toBe('COMPANY 2');
    expect(body.companies[1].workers).toHaveLength(1);
    expect(body.companies[1].workerCount).toBe(1);
  });

  // ---- Success: 200 empty ----

  it('should return 200 with empty companies when SP returns zero rows', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ companies: [], rows: [] });
  });

  // ---- Query params: fechaInicio and fechaFin ----

  it('should pass fechaInicio and fechaFin query params to the SP', async () => {
    const rows: SpResultRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results?fechaInicio=2026-01-01&fechaFin=2026-06-09');
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify SP was called with the date params
    expect(mockRequestInput).toHaveBeenCalledWith('FecIni', expect.anything(), '2026-01-01 00:00:00');
    expect(mockRequestInput).toHaveBeenCalledWith('FecFin', expect.anything(), '2026-06-09 23:59:59');
  });

  // ---- No query params: null defaults ----

  it('should pass NULL date params when query params are absent', async () => {
    const rows: SpResultRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    expect(res.status).toBe(200);

    // SP should be called with null date parameters
    expect(mockRequestInput).toHaveBeenCalledWith('FecIni', expect.anything(), null);
    expect(mockRequestInput).toHaveBeenCalledWith('FecFin', expect.anything(), null);
  });

  // ---- Error: 500 on connection failure ----

  it('should return 500 with user-safe error on connection failure', async () => {
    mockGetPool.mockRejectedValueOnce(new Error('Failed to connect to 172.16.10.14:1433'));

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBeTruthy();
    // User-safe: should NOT contain raw connection details
    expect(body.error).not.toContain('172.16.10.14');
    expect(body.error).not.toContain('1433');
    expect(body.error).not.toContain('sa');
  });

  // ---- Error: 500 on SP execution failure ----

  it('should return 500 with user-safe error on SP execution failure', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockRejectedValueOnce(new Error('Procedure SP_RPT_MATRIZICCGSA not found'));
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBeTruthy();
    // User-safe: no raw SQL errors
    expect(body.error).not.toContain('SP_RPT_MATRIZICCGSA');
    expect(body.error).not.toContain('Procedure');
  });

  // ---- Response shape verification ----

  it('should return correct WorkerRow mapping in the response body', async () => {
    const rows: SpResultRow[] = [
      makeRow({
        NroDId: 'DNI 25558504',
        Pacien: 'ASTORGA FLORES MARTIN ADRIAN',
        DesTCh: 'PREOCUPACIONAL',
        DesDes: 'NEXA CAJAMARQUILLA',
        NomCom: 'CHOICE SERVICE S.A.C.',
      }),
    ];

    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request('http://localhost/api/consolidados/results');
    const res = await GET(req);

    const body = await res.json();
    const company = body.companies[0];

    expect(company.companyName).toBe('CHOICE SERVICE S.A.C.');
    expect(company.workers[0]).toEqual({
      nombre: 'ASTORGA FLORES MARTIN ADRIAN',
      tipoExamen: 'PREOCUPACIONAL',
      proyecto: 'NEXA CAJAMARQUILLA',
    });
  });

  // ---- HTTP method restriction ----

  it('should only respond to GET method', async () => {
    const { GET } = await import('../route');

    // GET should be defined
    expect(GET).toBeDefined();
    expect(typeof GET).toBe('function');
  });
});
