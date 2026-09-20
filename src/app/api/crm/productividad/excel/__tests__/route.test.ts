import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ExcelJS from 'exceljs';

// ---- Mock auth session + the idUsuario→usuario lookup seam ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

const mockGetUsuarioDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mockGetUsuarioDb,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';
import { HOJA_PRODUCTIVIDAD } from '@/features/crm/infrastructure/excel/productividadExcelBuilder';
import { ENCABEZADOS_PRODUCTIVIDAD } from '@/features/crm/infrastructure/excel/productividadExcelBuilder';
import type {
  CrmActividadesRepositoryPort,
  CrmResultadosRepositoryPort,
} from '@/features/crm/domain/ports';

/**
 * `/api/crm/productividad/excel` seam matrix (tasks pr17/WU2, spec G6
 * "exportar Excel"): identical scoping to the pr16 JSON endpoint —
 * strict period validation, canonical sub→usuario resolution, and a
 * scope the client can never widen — but it STREAMS the .xlsx workbook
 * (mime + attachment disposition + no-store) instead of JSON.
 */

const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeFakeActividades(conteos: { usuario: string; total: number }[]): CrmActividadesRepositoryPort {
  return {
    registrarEnvioCadencia: vi.fn(),
    contarActividadesPorUsuario: vi.fn().mockResolvedValue(conteos),
  };
}

function makeFakeResultados(
  conteos: { usuario: string; tipo: string; total: number }[],
): CrmResultadosRepositoryPort {
  return {
    registrar: vi.fn(),
    contarResultadosPorUsuario: vi.fn().mockResolvedValue(conteos),
  };
}

function setDb(actividades: CrmActividadesRepositoryPort, resultados: CrmResultadosRepositoryPort): void {
  __setCrmDbForTests({
    pool: {} as never,
    empresas: {} as never,
    importador: {} as never,
    pipeline: {} as never,
    transiciones: {} as never,
    resultados,
    handoffs: {} as never,
    actividades,
    asignaciones: {} as never,
  } satisfies CrmDb);
}

/** Sessions: sub '10' resolves to login name 'jperez'; '11' to 'mgarcia'. */
const crmJperez = { sub: '10', nombre: 'Juan Perez', area: 'ventas', permisos: ['crm'] };
const adminMgarcia = { sub: '11', nombre: 'Maria Garcia', area: 'ventas', permisos: ['crm', 'crm_admin'] };

function mockUsuarioLookup(mapa: Record<string, string | null>): void {
  mockGetUsuarioDb.mockResolvedValue({
    getById: vi.fn(async (id: string) =>
      mapa[id] === undefined ? null : { idUsuario: id, usuario: mapa[id] },
    ),
  });
}

function pedir(query = ''): Request {
  return new Request(`http://localhost/api/crm/productividad/excel${query}`, { method: 'GET' });
}

const PERIODO_OK = '?desde=2026-09-01&hasta=2026-09-30';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetUsuarioDb.mockReset();
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/productividad/excel — auth matrix', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir(PERIODO_OK));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 without the crm permiso', async () => {
    mockGetSession.mockResolvedValue({ ...crmJperez, permisos: ['otro'] });
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir(PERIODO_OK));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 401 when the session’s idUsuario no longer resolves (stale session)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({});
    setDb(makeFakeActividades([]), makeFakeResultados([]));

    const response = await GET(pedir(PERIODO_OK));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/crm/productividad/excel — period validation', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    setDb(makeFakeActividades([]), makeFakeResultados([]));
  });

  it('returns 400 when desde is missing', async () => {
    const response = await GET(pedir('?hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when hasta is missing', async () => {
    const response = await GET(pedir('?desde=2026-09-01'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a malformed date', async () => {
    const response = await GET(pedir('?desde=09/01/2026&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an impossible calendar date', async () => {
    const response = await GET(pedir('?desde=2026-02-31&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when desde is after hasta', async () => {
    const response = await GET(pedir('?desde=2026-10-01&hasta=2026-09-30'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/crm/productividad/excel — scoping proof + workbook streaming', () => {
  it('streams the scoped workbook to a plain crm holder (identity resolved from sub)', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const actividades = makeFakeActividades([{ usuario: 'jperez', total: 10 }]);
    const resultados = makeFakeResultados([
      { usuario: 'jperez', tipo: 'CotizaciónEnviada', total: 3 },
    ]);
    setDb(actividades, resultados);

    const response = await GET(pedir(PERIODO_OK));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(MIME_XLSX);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('.xlsx');
    expect(response.headers.get('cache-control')).toBe('no-store');

    // THE scoping proof: the resolved LOGIN NAME filters — the client
    // never gets to choose the scope.
    expect(actividades.contarActividadesPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      'jperez',
    );
    expect(resultados.contarResultadosPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      'jperez',
    );

    // The streamed bytes are a real workbook carrying THIS session's
    // scoped rows and the requested period (end-to-end round-trip).
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet(HOJA_PRODUCTIVIDAD);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;
    const titulo = sheetDefinida.getRow(1).getCell(1).text;
    expect(titulo).toContain('01/09/2026');
    expect(titulo).toContain('30/09/2026');
    expect(sheetDefinida.getRow(2).getCell(1).text).toBe(ENCABEZADOS_PRODUCTIVIDAD[0]);
    expect(sheetDefinida.getRow(3).getCell(1).text).toBe('jperez');
    expect(sheetDefinida.getRow(3).getCell(2).value).toBe(10);
  });

  it('streams ALL users to a crm_admin (no filter reaches the ports)', async () => {
    mockGetSession.mockResolvedValue(adminMgarcia);
    mockUsuarioLookup({ '11': 'mgarcia' });
    const actividades = makeFakeActividades([
      { usuario: 'jperez', total: 2 },
      { usuario: 'mgarcia', total: 5 },
    ]);
    const resultados = makeFakeResultados([]);
    setDb(actividades, resultados);

    const response = await GET(pedir(PERIODO_OK));
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet(HOJA_PRODUCTIVIDAD) as ExcelJS.Worksheet;

    expect(response.status).toBe(200);
    expect(actividades.contarActividadesPorUsuario).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
      undefined,
    );
    expect(sheet.getRow(3).getCell(1).text).toBe('jperez');
    expect(sheet.getRow(4).getCell(1).text).toBe('mgarcia');
  });

  it('maps an internal failure to 500 INTERNAL_ERROR with a generic Spanish message', async () => {
    mockGetSession.mockResolvedValue(crmJperez);
    mockUsuarioLookup({ '10': 'jperez' });
    const actividades = makeFakeActividades([]);
    (actividades.contarActividadesPorUsuario as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    );
    setDb(actividades, makeFakeResultados([]));

    const response = await GET(pedir(PERIODO_OK));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).not.toContain('db down');
  });
});
