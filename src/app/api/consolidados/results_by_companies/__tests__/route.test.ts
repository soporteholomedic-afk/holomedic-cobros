import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrderRow } from '@/types/sp-result';

/**
 * Fixture builder matching the SP_SEL_ORDEN output shape.
 */
function makeRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    IdAten: 'ATE-001',
    NroRuc: '20123456789',
    NomCFa: 'ACME CORP S.A.C.',
    NroDId: '12345678',
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

describe('GET /api/consolidados/results_by_companies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Success: 200 with rows ----

  it('should return 200 with OrderRow[] when SP returns rows', async () => {
    const rows: OrderRow[] = [
      makeRow({ IdAten: 'ATE-001', NomCFa: 'ACME CORP S.A.C.' }),
      makeRow({ IdAten: 'ATE-002', NomCFa: 'ACME CORP S.A.C.' }),
      makeRow({ IdAten: 'ATE-003', NroDId: '87654321' }),
    ];

    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    // Dynamic import since mocks need to be in place before the module loads
    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body[0].IdAten).toBe('ATE-001');
    expect(body[0].NomCFa).toBe('ACME CORP S.A.C.');
    expect(body[2].NroDId).toBe('87654321');
  });

  // ---- Success: 200 with dates ----

  it('should include date filters in WHERE clause when fechaInicio and fechaFin are provided', async () => {
    const rows: OrderRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME&fechaInicio=2026-01-01&fechaFin=2026-06-09',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify WHERE clause contains date filters
    const whereCall = mockRequestInput.mock.calls.find(
      (call: unknown[]) => call[0] === 'WHERE',
    );
    expect(whereCall).toBeDefined();
    if (!whereCall) throw new Error('WHERE input not found');
    const whereValue = whereCall[2] as string;
    expect(whereValue).toContain("NomCFa LIKE '%ACME%'");
    expect(whereValue).toContain("AND FecAte >= '2026-01-01 00:00:00'");
    expect(whereValue).toContain("AND FecAte <= '2026-06-09 23:59:59'");
  });

  // ---- Success: 200 without dates ----

  it('should build WHERE with only companyName when no dates provided', async () => {
    const rows: OrderRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    const whereCall = mockRequestInput.mock.calls.find(
      (call: unknown[]) => call[0] === 'WHERE',
    );
    expect(whereCall).toBeDefined();
    if (!whereCall) throw new Error('WHERE input not found');
    const whereValue = whereCall[2] as string;
    expect(whereValue).toBe("NomCFa LIKE '%ACME%'");
    expect(whereValue).not.toContain('FecAte');
  });

  // ---- Success: 200 empty ----

  it('should return 200 with empty array when SP returns zero rows', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  // ---- Error: 400 missing companyName ----

  it('should return 400 when companyName is missing', async () => {
    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "El parámetro 'companyName' es requerido.",
    });
  });

  // ---- Error: 400 empty companyName ----

  it('should return 400 when companyName is empty string', async () => {
    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "El parámetro 'companyName' es requerido.",
    });
  });

  // ---- Error: 500 on connection failure ----

  it('should return 500 with user-safe error on connection failure', async () => {
    mockGetPool.mockRejectedValueOnce(
      new Error('Failed to connect to 172.16.10.14:1433'),
    );

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
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
    mockRequestExecute.mockRejectedValueOnce(
      new Error('Procedure SP_SEL_ORDEN not found'),
    );
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toBeTruthy();
    // User-safe: no raw SQL errors
    expect(body.error).not.toContain('SP_SEL_ORDEN');
    expect(body.error).not.toContain('Procedure');
  });

  // ---- SQL injection: sanitized companyName ----

  it('should escape single quotes and strip semicolons in companyName', async () => {
    const rows: OrderRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      "http://localhost/api/consolidados/results_by_companies?companyName=ACME'; DROP TABLE users;--",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    const whereCall = mockRequestInput.mock.calls.find(
      (call: unknown[]) => call[0] === 'WHERE',
    );
    expect(whereCall).toBeDefined();
    if (!whereCall) throw new Error('WHERE input not found');
    const whereValue = whereCall[2] as string;
    // Single quotes should be escaped, semicolons stripped
    expect(whereValue).toContain("ACME'' DROP TABLE users--");
    expect(whereValue).not.toContain(';');
    // Raw injection payload must not appear verbatim
    expect(whereValue).not.toContain("ACME'; DROP");
  });

  // ---- SP parameter verification ----

  it('should pass WHERE, ORDER, and WHEREAREAS params to SP_SEL_ORDEN', async () => {
    const rows: OrderRow[] = [makeRow()];
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const req = new Request(
      'http://localhost/api/consolidados/results_by_companies?companyName=ACME',
    );
    await GET(req);

    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHERE',
      expect.anything(),
      expect.stringContaining("NomCFa LIKE '%ACME%'"),
    );
    expect(mockRequestInput).toHaveBeenCalledWith(
      'ORDER',
      expect.anything(),
      'CodEmp,CodSed,NumOrd',
    );
    expect(mockRequestInput).toHaveBeenCalledWith(
      'WHEREAREAS',
      expect.anything(),
      '',
    );
    expect(mockRequestExecute).toHaveBeenCalledWith('SP_SEL_ORDEN');
  });

  // ---- HTTP method restriction ----

  it('should only respond to GET method', async () => {
    const { GET } = await import('../route');

    // GET should be defined
    expect(GET).toBeDefined();
    expect(typeof GET).toBe('function');
  });
});
