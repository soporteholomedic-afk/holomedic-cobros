import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('GET /api/consolidados/sedes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Success: 200 with active sedes ----

  it('should return 200 with trimmed sedes when SP returns rows', async () => {
    const rows = [
      { CodSed: 1, NomSed: 'SEDE SURQUILLO' },
      { CodSed: 2, NomSed: 'CAMPAÑA (HISTORICO)' },
      { CodSed: 3, NomSed: 'CAMPAÑA' },
    ];

    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sedes).toEqual([
      { codSed: 1, nomSed: 'SEDE SURQUILLO' },
      { codSed: 2, nomSed: 'CAMPAÑA (HISTORICO)' },
      { codSed: 3, nomSed: 'CAMPAÑA' },
    ]);
  });

  // ---- SP inputs: WHERE and ORDER ----

  it('should query active sedes (IndReg = 1) ordered by CodSed', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    await GET();

    expect(mockRequestInput).toHaveBeenCalledWith('WHERE', expect.anything(), 'IndReg = 1');
    expect(mockRequestInput).toHaveBeenCalledWith('ORDER', expect.anything(), 'CodSed');
    expect(mockRequestExecute).toHaveBeenCalledWith('SP_SEL_SEDE');
  });

  // ---- NULL NomSed tolerance ----

  it('should map NULL NomSed to empty string instead of failing', async () => {
    const rows = [{ CodSed: 1, NomSed: null }];

    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: rows });
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sedes).toEqual([{ codSed: 1, nomSed: '' }]);
  });

  // ---- Error: 500 on SP execution failure ----

  it('should return 500 with user-safe error on SP execution failure', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockRejectedValueOnce(new Error('Procedure SP_SEL_SEDE not found'));
    mockGetPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // User-safe: no raw SQL errors
    expect(body.error).not.toContain('SP_SEL_SEDE');
    expect(body.error).not.toContain('Procedure');
  });
});
