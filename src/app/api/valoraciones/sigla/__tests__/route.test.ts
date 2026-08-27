import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock setup (sedes-route pattern: fake pool at the @/lib/db boundary) ----

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

function makeUrl(query: string): Request {
  return new Request(`http://localhost/api/valoraciones/sigla${query}`);
}

const OK_QUERY =
  '?fecIni=2026-01-01&fecFin=2026-01-31&codMon=1&indFac=0&inFsta=false';

describe('GET /api/valoraciones/sigla', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    __setValoracionesDbForTests(null);
  });

  // ---- Success: 200 with mapped rows ----

  it('returns 200 with rows mapped through the repository', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({
      recordset: [
        {
          NomCFa: 'EMPRESA A',
          NomCom: 'EMPRESA A',
          DesDes: 'OFICINA',
          CenCos: 'CC1',
          NroDId: 'DNI 12345678',
          Pacien: 'PACIENTE UNO',
          EdaPac: 30,
          FecNac: null,
          DesPue: 'OBRERO',
          DsTiTr: 'OBRERO',
          FecAte: new Date('2026-01-15T00:00:00'),
          FecSTA: null,
          DesTCh: 'PREOCUPACIONAL',
          NomPro: 'PROY',
          Result: 'APTO',
          Anex7D: 'S',
          CodMon: 1,
          DesMon: 'SOLES',
          Simbol: 's/.',
          VImpMN: 118,
          VImpMO: 0,
          VVtaMN: 100.5,
          VVtaMO: 0,
          Solici: 'SOL',
          Admini: 'ADM',
          IdAten: '0001',
          ItemEx: 1,
          TipDov: 'FT',
          NumDov: null,
          EstCob: 'P',
          NomCli: 'EMPRESA A',
          IndCon: true,
          IdConv: 'C1',
          CodSeC: null,
          NumCob: null,
          NroVal: 'V1',
          NroOPe: 'O1',
          CodiEM: 'EM1',
          FecRec: null,
        },
      ],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl(OK_QUERY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0]).toMatchObject({
      NomCFa: 'EMPRESA A',
      FecSTA: null,
      VVtaMN: 100.5,
      CodiEM: 'EM1',
    });
    expect(body.resultados[0].FecAte).toBe(new Date('2026-01-15T00:00:00').toISOString());
  });

  it('executes the SP via the read-only pool with typed binds and time bounds', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    await GET(makeUrl(`${OK_QUERY}&codCli=7&tipTra=620001`));

    expect(mockRequestExecute).toHaveBeenCalledWith('SP_RPT_REPFACTURACION');
    expect(mockRequestInput).toHaveBeenCalledWith('FecIni', expect.anything(), new Date('2026-01-01T00:00:00'));
    expect(mockRequestInput).toHaveBeenCalledWith('FecFin', expect.anything(), new Date('2026-01-31T23:59:59'));
    expect(bindValue('CodMon')).toBe(1);
    expect(bindValue('CodCli')).toBe(7);
    expect(bindValue('TipTra')).toBe(620001);
    // default indFac = 0 (No Facturados) travels as BIT false
    expect(bindValue('IndFac')).toBe(false);
    expect(bindValue('InFSTA')).toBe(false);
  });

  // ---- Validation: 400 without any SP/pool call ----

  it('rejects a missing periodo with 400 and never touches the pool', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeUrl('?codMon=1'));

    expect(res.status).toBe(400);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('rejects an inverted period with 400 before any SP call', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeUrl('?fecIni=2026-02-01&fecFin=2026-01-31&codMon=1'));

    expect(res.status).toBe(400);
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('rejects an impossible date (regex-valid but calendar-invalid) with 400', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeUrl('?fecIni=2026-13-45&fecFin=2026-01-31&codMon=1'));

    expect(res.status).toBe(400);
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid codMon with 400', async () => {
    const { GET } = await import('../route');

    const missing = await GET(makeUrl('?fecIni=2026-01-01&fecFin=2026-01-31'));
    expect(missing.status).toBe(400);

    const invalid = await GET(makeUrl('?fecIni=2026-01-01&fecFin=2026-01-31&codMon=3'));
    expect(invalid.status).toBe(400);
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('rejects an invalid indFac value with 400', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeUrl('?fecIni=2026-01-01&fecFin=2026-01-31&codMon=1&indFac=5'));

    expect(res.status).toBe(400);
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('accepts indFac=null (Todos) and inFsta=true as BIT binds', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl('?fecIni=2026-01-01&fecFin=2026-01-31&codMon=2&indFac=null&inFsta=true'));

    expect(res.status).toBe(200);
    expect(bindValue('IndFac')).toBeNull();
    expect(bindValue('InFSTA')).toBe(true);
    expect(bindValue('CodMon')).toBe(2);
  });

  it('binds <=0 numeric filters as NULL (no filter)', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValueOnce({ recordset: [] });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    await GET(makeUrl(`${OK_QUERY}&codCli=0&codSed=-4`));

    expect(bindValue('CodCli')).toBeNull();
    expect(bindValue('CodSed')).toBeNull();
    expect(mockRequestExecute).toHaveBeenCalled();
  });

  // ---- Failure: user-safe 500 ----

  it('returns a user-safe 500 when the SP fails (no SP-name leakage)', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockRejectedValueOnce(
      new Error("Procedure or object 'SP_RPT_REPFACTURACION' not found"),
    );
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl(OK_QUERY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).not.toContain('SP_RPT_REPFACTURACION');
    expect(body.error).not.toContain('Procedure');
  });

  it('returns a user-safe 500 when the pool config rejects sa (config error)', async () => {
    mockGetSiglaReadOnlyPool.mockRejectedValueOnce(
      new Error('SIGLA read-only pool misconfiguration: resolved user "sa"'),
    );

    const { GET } = await import('../route');
    const res = await GET(makeUrl(OK_QUERY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('sa');
  });
});

// ---- Consolidado branch (slice 2, task 2.4/Q-R6) ----

describe('GET /api/valoraciones/sigla?consolidado=true', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    __setValoracionesDbForTests(null);
  });

  it('rejects consolidado without a client with 400 and no SP call', async () => {
    const { GET } = await import('../route');
    const res = await GET(makeUrl(`${OK_QUERY}&consolidado=true`));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('cliente');
    expect(mockGetSiglaReadOnlyPool).not.toHaveBeenCalled();
    expect(mockRequestExecute).not.toHaveBeenCalled();
  });

  it('executes both consolidado SPs, applies the ajuste and returns filas+totales', async () => {
    const mockPool = createMockPool();
    // Main SP: one preocupacional row + one PERIODICO row on another destino.
    mockRequestExecute.mockResolvedValueOnce({
      recordset: [
        { CodCli: 55, NomCom: 'EMPRESA DEMO', CodDes: 101, DesDes: 'SEDE NORTE', IdeTCh: 510001, DesTCh: 'PREOCUPACIONAL', CanEva: 5, VImpMN: 1180, VImpMO: 0, VVtaMN: 1000, VVtaMO: 0 },
        { CodCli: 55, NomCom: 'EMPRESA DEMO', CodDes: 102, DesDes: 'SEDE SUR', IdeTCh: 510008, DesTCh: 'PERIODICO', CanEva: 2, VImpMN: 236, VImpMO: 0, VVtaMN: 200, VVtaMO: 0 },
      ],
    });
    // Adicionales SP: one adicional on SEDE NORTE (ValVta 100 / ValImp 118).
    mockRequestExecute.mockResolvedValueOnce({
      recordset: [
        { CodCli: 55, NomCom: 'EMPRESA DEMO', CodDes: 101, DesDes: 'SEDE NORTE', NomSer: 'ADI UNO', CanEva: 1, ValImp: 118, ValVta: 100 },
      ],
    });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl(`${OK_QUERY}&consolidado=true&codCli=55`));

    expect(res.status).toBe(200);
    expect(mockRequestExecute).toHaveBeenNthCalledWith(1, 'SP_RPT_CONSOLIDADOFACTURACION');
    expect(mockRequestExecute).toHaveBeenNthCalledWith(2, 'SP_RPT_CONSOLIDADOFACTURACION_ADICIONALES');
    // Consolidado drops CodMon/CodCFa/InFSTA binds entirely.
    expect(mockRequestInput.mock.calls.some((c) => c[0] === 'CodMon')).toBe(false);
    expect(mockRequestInput.mock.calls.some((c) => c[0] === 'CodCFa')).toBe(false);
    expect(mockRequestInput.mock.calls.some((c) => c[0] === 'InFSTA')).toBe(false);
    expect(bindValue('CodCli')).toBe(55);

    const body = await res.json();
    // Ajuste applied server-side: preocupacional 1000 - 100 = 900 (+ appended adicional row).
    expect(body.filas).toHaveLength(3);
    expect(body.filas[0]).toMatchObject({ desTCh: 'PREOCUPACIONAL', venta: 900, importe: 1062 });
    expect(body.filas[1]).toMatchObject({ desTCh: 'PERIODICO', venta: 200, importe: 236 });
    expect(body.filas[2]).toMatchObject({ desTCh: 'ADI UNO', venta: 100, importe: 118 });
    // Per-destino totals: SEDE NORTE 900+100=1000 → IGV 180 → 1180; SEDE SUR 200 → 36 → 236.
    expect(body.totales).toEqual([
      { nomCom: 'EMPRESA DEMO', desDes: 'SEDE NORTE', codDes: 101, subtotal: 1000, igv: 180, total: 1180 },
      { nomCom: 'EMPRESA DEMO', desDes: 'SEDE SUR', codDes: 102, subtotal: 200, igv: 36, total: 236 },
    ]);
  });

  it('treats consolidado=1 the same as consolidado=true', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockResolvedValue({ recordset: [] });
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl(`${OK_QUERY}&consolidado=1&codCli=9`));

    expect(res.status).toBe(200);
    expect(mockRequestExecute).toHaveBeenCalledWith('SP_RPT_CONSOLIDADOFACTURACION');
    const body = await res.json();
    expect(body.filas).toEqual([]);
    expect(body.totales).toEqual([]);
  });

  it('returns a user-safe 500 when the consolidado SP is missing (live-DB reality)', async () => {
    const mockPool = createMockPool();
    mockRequestExecute.mockRejectedValueOnce(new Error("Could not find stored procedure 'SP_RPT_CONSOLIDADOFACTURACION'."));
    mockGetSiglaReadOnlyPool.mockResolvedValueOnce(mockPool);

    const { GET } = await import('../route');
    const res = await GET(makeUrl(`${OK_QUERY}&consolidado=true&codCli=55`));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('SP_RPT');
    expect(body.error).not.toContain('stored procedure');
  });
});
