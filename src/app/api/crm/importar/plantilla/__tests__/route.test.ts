// @vitest-environment node
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ENCABEZADOS_PLANTILLA } from '@/features/crm/infrastructure/excel/leerExcelEmpresas';
import { crmSession, sinCrmSession } from '../../../_lib/__tests__/fixtures';
import { XLSX_MIME } from '../../../_lib/__tests__/importacion';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET } from '../route';

describe('GET /api/crm/importar/plantilla', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));

  it('downloads an .xlsx named plantilla-empresas.xlsx with the six template headers', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(XLSX_MIME);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="plantilla-empresas.xlsx"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer);
    const fila = wb.worksheets[0].getRow(1);
    expect(ENCABEZADOS_PLANTILLA.map((_, i) => fila.getCell(i + 1).value)).toEqual([...ENCABEZADOS_PLANTILLA]);
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('returns 401 %s and sends no file', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado' });
    expect(res.headers.get('content-disposition')).toBeNull();
  });
});
