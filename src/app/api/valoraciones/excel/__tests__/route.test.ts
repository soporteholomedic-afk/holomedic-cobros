import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';

import type { ISiglaValoracionesRepository } from '@/features/valoraciones/domain/ports';
import { makeRepFacturacion } from '@/features/valoraciones/domain/fixtures';

/**
 * POST /api/valoraciones/excel (REQ-03 E-R3). The repository is injected
 * through its test seam — no SQL.
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

  it('returns a .xlsx with download Content-Disposition and the 30-column header', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain('valoraciones_2026-01-01_2026-01-31.xlsx');

    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
    });
    expect(aoa[0]).toHaveLength(30);
    expect(aoa[0][0]).toBe('facturar a');
    expect(aoa[0][29]).toBe('nro_cob');
    expect(aoa).toHaveLength(2); // header + 1 row
  });

  it('re-queries from the posted filter with the query codMon (D4)', async () => {
    const { POST } = await import('../route');
    await POST(makeRequest({ ...filtroValido, codMon: 2, codCli: 55 }));

    expect(fakeRepo.buscarValoraciones).toHaveBeenCalledTimes(1);
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado).toMatchObject({ codMon: 2, codCli: 55, fecIni: '2026-01-01' });
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
});
