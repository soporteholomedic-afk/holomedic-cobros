import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SpResultRow, OrderRow, UnifiedPerson } from '@/types/sp-result';

// ---- Import under test ----
import { useUnifiedResults } from '../useUnifiedResults';

// ---- Fixture: raw SP_RPT_MATRIZICCGSA rows (workers) ----

function makeWorkerRow(overrides: Partial<SpResultRow> = {}): SpResultRow {
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

// ---- Fixture: SP_SEL_ORDEN rows (orders/patients) ----

function makeOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    IdAten: 'ATE-001',
    NroRuc: '20123456789',
    NomCFa: 'CIME INGENIEROS S R L',
    NroDId: '25721424',
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as Response;
}

function mockFetchError(): never {
  throw new Error('Network error');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useUnifiedResults', () => {
  // ---- Scenario 1: Both sources with matching DNI → single UnifiedPerson ----

  it('should merge worker and order data into a single UnifiedPerson when DNIs match', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 25721424', Pacien: 'GILMER FALLA', DesTCh: 'PERIODICO', DesDes: 'UNACEM', NomCom: 'CIME INGENIEROS' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-001', NroRuc: '20123456789', NomCFa: 'CIME INGENIEROS S R L', NroDId: '25721424' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('CIME INGENIEROS', '2026-01-01', '2026-06-30'),
    );

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.people).toHaveLength(1);

    const person = result.current.people[0];
    expect(person.dni).toBe('25721424');
    expect(person.nombre).toBe('GILMER FALLA');
    expect(person.empresa).toBe('CIME INGENIEROS');
    expect(person.tipoExamen).toBe('PERIODICO');
    expect(person.proyecto).toBe('UNACEM');
    expect(person.fichas).toHaveLength(1);
    expect(person.fichas[0].idAten).toBe('ATE-001');
    expect(person.fichas[0].nroRuc).toBe('20123456789');
    expect(person.fichas[0].nomCFa).toBe('CIME INGENIEROS S R L');
  });

  // ---- Scenario 2: Worker-only person (no matching order) ----

  it('should include worker-only person with empty fichas when no order matches', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 12345678', Pacien: 'WORKER ONLY', DesTCh: 'EXAM-X', DesDes: 'PROJ-X', NomCom: 'CO X' }),
    ];
    const orderRows: OrderRow[] = []; // no matching orders

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('CO X', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    const person = result.current.people[0];
    expect(person.dni).toBe('12345678');
    expect(person.nombre).toBe('WORKER ONLY');
    expect(person.empresa).toBe('CO X');
    expect(person.fichas).toEqual([]);
  });

  // ---- Scenario 3: Order-only person (no matching worker) ----

  it('should include order-only person with worker fields empty when no worker matches', async () => {
    const workerRows: SpResultRow[] = [];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-999', NroRuc: '20999999999', NomCFa: 'ORDER ONLY CO', NroDId: '99999999' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('ORDER ONLY CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    const person = result.current.people[0];
    expect(person.dni).toBe('99999999');
    expect(person.nombre).toBe('');
    expect(person.empresa).toBe('');
    expect(person.fichas).toHaveLength(1);
    expect(person.fichas[0].idAten).toBe('ATE-999');
    expect(person.fichas[0].nroRuc).toBe('20999999999');
    expect(person.fichas[0].nomCFa).toBe('ORDER ONLY CO');
  });

  // ---- Scenario 4: Multi-ficha person (same DNI → multiple order rows) ----

  it('should group multiple order rows under a single person with fichas.length > 1', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 11111111', Pacien: 'MULTIFICHADO', DesTCh: 'COMPLETO', DesDes: 'PROJ-MF', NomCom: 'MULTI CO' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'FICHA-100', NroRuc: '20000000001', NomCFa: 'MULTI CO', NroDId: '11111111' }),
      makeOrderRow({ IdAten: 'FICHA-200', NroRuc: '20000000002', NomCFa: 'MULTI CO ALT', NroDId: '11111111' }),
      makeOrderRow({ IdAten: 'FICHA-300', NroRuc: '20000000003', NomCFa: 'MULTI CO TER', NroDId: '11111111' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('MULTI CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    const person = result.current.people[0];
    expect(person.dni).toBe('11111111');
    expect(person.nombre).toBe('MULTIFICHADO');
    expect(person.fichas).toHaveLength(3);
    expect(person.fichas[0].idAten).toBe('FICHA-100');
    expect(person.fichas[1].idAten).toBe('FICHA-200');
    expect(person.fichas[2].idAten).toBe('FICHA-300');
  });

  // ---- Scenario 5: Both datasets empty ----

  it('should return empty people array when both datasets are empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: [] }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('NO DATA CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.people).toEqual([]);
  });

  // ---- Scenario 6: Partial failure — worker fetch succeeds, order fetch fails ----

  it('should show worker data when order fetch fails (graceful degradation)', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 55555555', Pacien: 'GRACEFUL', DesTCh: 'EX-G', DesDes: 'PROJ-G', NomCom: 'GRACE CO' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.reject(new Error('Order fetch failed'));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('GRACE CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    const person = result.current.people[0];
    expect(person.dni).toBe('55555555');
    expect(person.nombre).toBe('GRACEFUL');
    expect(person.fichas).toEqual([]);
    // Should not surface error for partial failure (spec says loading=false, error=null)
    expect(result.current.error).toBeNull();
  });

  // ---- Scenario 7: Both fetches fail ----

  it('should set error when both fetches fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Both failed'));

    const { result } = renderHook(() =>
      useUnifiedResults('FAIL CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Error al cargar los consolidados. Intente nuevamente.');
    expect(result.current.people).toEqual([]);
  });

  // ---- Scenario 8: DNI format edge cases handled via normalizeDni ----

  it('should match worker with "DNI " prefix to order with bare DNI', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 12345678', Pacien: 'PREFIXED WORKER', DesTCh: 'EX-P', DesDes: 'PROJ-P', NomCom: 'PREFIX CO' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-P1', NroRuc: '20000000001', NomCFa: 'PREFIX CO', NroDId: '12345678' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('PREFIX CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    expect(result.current.people[0].dni).toBe('12345678');
    expect(result.current.people[0].nombre).toBe('PREFIXED WORKER');
    expect(result.current.people[0].fichas).toHaveLength(1);
  });

  // ---- Scenario 9: Multiple workers and orders mixed ----

  it('should correctly separate different DNIs into distinct people', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 11111111', Pacien: 'PERSON A', DesTCh: 'EX-A', DesDes: 'PROJ-A', NomCom: 'MIXED CO' }),
      makeWorkerRow({ NroDId: 'DNI 22222222', Pacien: 'PERSON B', DesTCh: 'EX-B', DesDes: 'PROJ-B', NomCom: 'MIXED CO' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'F-A1', NroRuc: '20000000001', NomCFa: 'MIXED CO', NroDId: '11111111' }),
      makeOrderRow({ IdAten: 'F-B1', NroRuc: '20000000002', NomCFa: 'MIXED CO', NroDId: '22222222' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('MIXED CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(2);
    // People should be sorted by nombre
    expect(result.current.people[0].dni).toBe('11111111');
    expect(result.current.people[0].nombre).toBe('PERSON A');
    expect(result.current.people[1].dni).toBe('22222222');
    expect(result.current.people[1].nombre).toBe('PERSON B');
  });

  // ---- Scenario 11: Same DNI, different projects (DesDes) ----

  it('should group same DNI with different projects under a single UnifiedPerson with multiple combined fichas', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 12345678', Pacien: 'DUPLICATE WORKER', DesTCh: 'PERIODICO', DesDes: 'UNACEM', NomCom: 'DUPLICATE CO' }),
      makeWorkerRow({ NroDId: 'DNI 12345678', Pacien: 'DUPLICATE WORKER', DesTCh: 'PREOCUPACIONAL', DesDes: 'MINSUR', NomCom: 'DUPLICATE CO' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-U1', NroRuc: '20111111111', NomCFa: 'DUPLICATE CO', NroDId: '12345678' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('DUPLICATE CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should generate only 1 person row for this DNI
    expect(result.current.people).toHaveLength(1);

    const person = result.current.people[0];
    expect(person.dni).toBe('12345678');
    expect(person.nombre).toBe('DUPLICATE WORKER');
    expect(person.empresa).toBe('DUPLICATE CO');
    
    // Main person row should show the first project's details
    expect(person.proyecto).toBe('UNACEM');
    expect(person.tipoExamen).toBe('PERIODICO');

    // Should contain 2 fichas (zipped)
    expect(person.fichas).toHaveLength(2);

    // Ficha 1 (UNACEM worker + ATE-U1 order)
    expect(person.fichas[0].idAten).toBe('ATE-U1');
    expect(person.fichas[0].nroRuc).toBe('20111111111');
    expect(person.fichas[0].proyecto).toBe('UNACEM');
    expect(person.fichas[0].tipoExamen).toBe('PERIODICO');

    // Ficha 2 (MINSUR worker + no order)
    expect(person.fichas[1].idAten).toBe('');
    expect(person.fichas[1].nroRuc).toBe('');
    expect(person.fichas[1].proyecto).toBe('MINSUR');
    expect(person.fichas[1].tipoExamen).toBe('PREOCUPACIONAL');
  });

  // ---- Scenario 12: Condic propagation ----
  // Spec REQ-WT-1 / REQ-WT-4: condic is captured from the SP row and propagated
  // to both UnifiedPerson.condic and UnifiedFicha.condic after normalization.
  // Use 'APTO' (a non-NULL value) for the failing-first assertion in this RED step.

  it('should propagate Condic "APTO" to UnifiedPerson.condic and UnifiedFicha.condic', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 77777777', Pacien: 'APTO WORKER', Condic: 'APTO', NomCom: 'APTO CO' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-A1', NroRuc: '20777777777', NomCFa: 'APTO CO', NroDId: '77777777' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('APTO CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(1);
    const person = result.current.people[0];
    expect(person.condic).toBe('APTO');
    expect(person.fichas).toHaveLength(1);
    expect(person.fichas[0].condic).toBe('APTO');
  });

  // ---- Scenario 13: normalizeCondic integration at the hook layer ----
  // Spec REQ-WT-3 / REQ-WT-4: the hook normalizes 'NULL', 'null', 'Null',
  // and whitespace-only Condic values to '' so the UI never sees the raw literal.
  // Sub-ficha condic comes from its own (proyecto+tipoExamen) row, not the primary.

  it('should normalize "NULL" / "null" / "Null" / whitespace Condic values to ""', async () => {
    const workerRows: SpResultRow[] = [
      makeWorkerRow({ NroDId: 'DNI 33333333', Pacien: 'NULL CAPS', Condic: 'NULL' }),
      makeWorkerRow({ NroDId: 'DNI 44444444', Pacien: 'NULL LOWER', Condic: 'null' }),
      makeWorkerRow({ NroDId: 'DNI 55555555', Pacien: 'NULL MIXED', Condic: 'Null' }),
      makeWorkerRow({ NroDId: 'DNI 66666666', Pacien: 'WS WORKER', Condic: '   ' }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-N1', NroRuc: '20333333333', NomCFa: 'N CO', NroDId: '33333333' }),
      makeOrderRow({ IdAten: 'ATE-N2', NroRuc: '20444444444', NomCFa: 'N CO', NroDId: '44444444' }),
      makeOrderRow({ IdAten: 'ATE-N3', NroRuc: '20555555555', NomCFa: 'N CO', NroDId: '55555555' }),
      makeOrderRow({ IdAten: 'ATE-N4', NroRuc: '20666666666', NomCFa: 'N CO', NroDId: '66666666' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('N CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.people).toHaveLength(4);
    for (const person of result.current.people) {
      expect(person.condic).toBe('');
      expect(person.fichas).toHaveLength(1);
      expect(person.fichas[0].condic).toBe('');
    }
  });

  it('should give each sub-ficha its own Condic from the corresponding worker row', async () => {
    // Same DNI, two distinct (proyecto+tipoExamen) workers, each with its own Condic.
    // Sub-ficha #2 must show NO APTO even though primary is APTO.
    const workerRows: SpResultRow[] = [
      makeWorkerRow({
        NroDId: 'DNI 12345678',
        Pacien: 'DUPLICATE WORKER',
        DesTCh: 'PERIODICO',
        DesDes: 'UNACEM',
        NomCom: 'DUPLICATE CO',
        Condic: 'APTO',
      }),
      makeWorkerRow({
        NroDId: 'DNI 12345678',
        Pacien: 'DUPLICATE WORKER',
        DesTCh: 'PREOCUPACIONAL',
        DesDes: 'MINSUR',
        NomCom: 'DUPLICATE CO',
        Condic: 'NO APTO',
      }),
    ];
    const orderRows: OrderRow[] = [
      makeOrderRow({ IdAten: 'ATE-U1', NroRuc: '20111111111', NomCFa: 'DUPLICATE CO', NroDId: '12345678' }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve(mockFetchResponse(orderRows));
      }
      return Promise.resolve(mockFetchResponse({ companies: [], rows: workerRows }));
    });

    const { result } = renderHook(() =>
      useUnifiedResults('DUPLICATE CO', '2026-01-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const person = result.current.people[0];
    // Primary row mirrors first worker's condic
    expect(person.condic).toBe('APTO');
    expect(person.fichas).toHaveLength(2);
    // Sub-fichas each carry their own worker row's condic
    expect(person.fichas[0].condic).toBe('APTO');
    expect(person.fichas[1].condic).toBe('NO APTO');
  });
});
