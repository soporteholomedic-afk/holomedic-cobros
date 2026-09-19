import { beforeEach, describe, expect, it, vi } from 'vitest';

import ExcelJS from 'exceljs';

// ---- Mock auth session (auth/me + pr4 CRM route precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';
import { COLUMNAS_IMPORT_CRM } from '@/features/crm/domain/importar/columnas';
import { HOJA_DATOS } from '@/features/crm/infrastructure/excel/plantillaCrmBuilder';

const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
});

describe('GET /api/crm/import/plantilla', () => {
  it('returns 401 UNAUTHORIZED without a session', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 FORBIDDEN with unrelated permisos', async () => {
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['cobranza'] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN with plain crm (crm_admin required in-route)', async () => {
    // The proxy prefix already gates /api/crm/import to crm_admin; the
    // route re-checks IN-ROUTE (design D2, pr4 POST precedent).
    mockGetSession.mockResolvedValue({ ...sessionBase, permisos: ['crm'] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('streams the .xlsx template to a crm_admin with download headers', async () => {
    mockGetSession.mockResolvedValue({
      ...sessionBase,
      permisos: ['crm', 'crm_admin'],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(MIME_XLSX);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('.xlsx');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBeGreaterThan(0);

    // The streamed bytes are a valid workbook exposing the shared
    // column contract (end-to-end drift sanity through the route).
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const encabezados = COLUMNAS_IMPORT_CRM.map(
      (_, index) => (sheet as ExcelJS.Worksheet).getRow(1).getCell(index + 1).text,
    );
    expect(encabezados).toEqual(
      COLUMNAS_IMPORT_CRM.map((columna) =>
        columna.requerido ? `${columna.encabezado}*` : columna.encabezado,
      ),
    );
  });

  it('maps an internal failure to 500 INTERNAL_ERROR with a generic Spanish message', async () => {
    // The route's catch-all maps ANY internal throw (builder failure,
    // session store outage) to the user-safe generic error.
    mockGetSession.mockRejectedValue(new Error('session store unavailable'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).not.toContain('session store');
  });
});
