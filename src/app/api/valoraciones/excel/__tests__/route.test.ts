import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import type { ISiglaValoracionesRepository } from '@/features/valoraciones/domain/ports';
import { makeRepFacturacion } from '@/features/valoraciones/domain/fixtures';

/**
 * POST /api/valoraciones/excel (REQ-03 E-R3; change: flat list with one
 * grand-total block). The repository is injected through its test seam —
 * no SQL. The response body is parsed with XLSX.read to prove the real
 * download contract: a VALORACIONES workbook (exceljs layout, header row
 * at absolute row 7) with the legacy filename/disposition behavior.
 */

const filtroValido = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/valoraciones/excel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Parse the response body as a workbook and return its rows anchored to
 * ABSOLUTE sheet indices (sheet_to_json is relative to `!ref`'s first
 * row; blank spacer rows must keep their index).
 */
async function leerAoaDeRes(res: Response): Promise<unknown[][]> {
  const buffer = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  expect(wb.SheetNames[0]).toBe('VALORACIONES');
  const sheet = wb.Sheets['VALORACIONES'];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: true,
  });
  const firstRow = XLSX.utils.decode_range(sheet['!ref'] as string).s.r;
  const absolute: unknown[][] = [];
  aoa.forEach((row, i) => {
    absolute[i + firstRow] = row;
  });
  return absolute;
}

describe('POST /api/valoraciones/excel', () => {
  let fakeRepo: ISiglaValoracionesRepository;

  beforeEach(async () => {
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    fakeRepo = {
      buscarValoraciones: vi
        .fn()
        .mockResolvedValue([makeRepFacturacion({ DesDes: 'SEDE NORTE', VVtaMN: 100 })]),
      buscarConsolidado: vi.fn(),
      buscarClientes: vi.fn(),
      buscarClientePorCodigo: vi.fn(),
      buscarPacientes: vi.fn(),
      buscarDestinos: vi.fn(),
      buscarTiposTrabajador: vi.fn(),
      buscarSedes: vi.fn(),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);
  });

  it('streams a VALORACIONES workbook with the legacy filename and disposition (R5)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('valoraciones_2026-01-01_2026-01-31.xlsx');

    // The body opens as a real workbook: flat 15-column layout with the
    // header at sheet row 7 (array index 6), the data row at sheet row 8
    // and the totals block right after the data.
    const aoa = await leerAoaDeRes(res);
    const header = aoa[6] as unknown[];
    expect(header).toHaveLength(15);
    expect(header[0]).toBe('facturar a');
    expect(header[14]).toBe('Costo (S/)');
    expect(aoa[7][5]).toBe('CANCINO CUEVA NOELIA ISABEL'); // first data row (nombre)
    expect(aoa[8][12]).toBe('SubTotal');
    expect(aoa[8][14]).toBe(100);
    expect(aoa[9][12]).toBe('IGV 18%');
    expect(aoa[9][14]).toBe(18);
    expect(aoa[10][12]).toBe('Total');
    expect(aoa[10][14]).toBe(118);
  });

  it('re-queries from the posted filter with the query codMon (D4)', async () => {
    const { POST } = await import('../route');
    await POST(makeRequest({ ...filtroValido, codMon: 2, codCli: 55 }));

    expect(fakeRepo.buscarValoraciones).toHaveBeenCalledTimes(1);
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado).toMatchObject({ codMon: 2, codCli: 55, fecIni: '2026-01-01' });
  });

  it('scopes rows to the posted empresa, names the file [Empresa]_[fecIni].xlsx and carries ONLY scoped patient rows (U6)', async () => {
    (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRepFacturacion({ NomCFa: 'EMPRESA DEMO S.A.C.', Pacien: 'PACIENTE DEMO' }),
      makeRepFacturacion({ NomCFa: 'OTRA EMPRESA SRL', NomCom: 'OTRA EMPRESA SRL', NomCli: 'OTRA EMPRESA SRL', Pacien: 'PACIENTE OTRA' }),
    ]);
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, empresa: 'OTRA EMPRESA SRL' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain(
      'filename="OTRA EMPRESA SRL_2026-01-01.xlsx"',
    );

    const aoa = await leerAoaDeRes(res);
    expect(aoa[7][5]).toBe('PACIENTE OTRA'); // data row 1 (sheet row 8) = scoped patient
    expect(aoa[8][5]).not.toBe('PACIENTE DEMO'); // NO second data row — scoped only
  });

  it('keeps the legacy filename for clientless exports (no empresa)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));
    expect(res.headers.get('content-disposition')).toContain(
      'filename="valoraciones_2026-01-01_2026-01-31.xlsx"',
    );
  });

  it('rejects an invalid empresa with 400 and never queries (U6)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, empresa: '' }));
    expect(res.status).toBe(400);
    expect(fakeRepo.buscarValoraciones).not.toHaveBeenCalled();
  });

  it('rejects an invalid filter with 400 and never queries', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ fecIni: '2026-02-01', fecFin: '2026-01-31', codMon: 1 }));

    expect(res.status).toBe(400);
    expect(fakeRepo.buscarValoraciones).not.toHaveBeenCalled();
  });

  it('maps repository failures to a user-safe 500', async () => {
    (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Could not find stored procedure 'SP_RPT_REPFACTURACION'."),
    );
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('SP_RPT');
    expect(body.error).not.toContain('stored procedure');
  });

  // ---- ocultarCero DTO flag (filtro-valores-cero, S12–S16) ----

  it('carries ocultarCero=true into the re-query filter so the workbook matches the screen (S14)', async () => {
    const { POST } = await import('../route');
    await POST(makeRequest({ ...filtroValido, ocultarCero: true }));

    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado.ocultarCero).toBe(true);
  });

  it('keeps the filter unchanged when the flag is absent or false (S12/S16)', async () => {
    const { POST } = await import('../route');
    await POST(makeRequest(filtroValido));
    await POST(makeRequest({ ...filtroValido, ocultarCero: false }));

    const llamadas = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0][0].ocultarCero).toBe(false);
    expect(llamadas[1][0].ocultarCero).toBe(false);
  });

  it('rejects a non-boolean ocultarCero with 400 before any query (S13)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, ocultarCero: 'si' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ocultarCero');
    expect(fakeRepo.buscarValoraciones).not.toHaveBeenCalled();
  });
});
