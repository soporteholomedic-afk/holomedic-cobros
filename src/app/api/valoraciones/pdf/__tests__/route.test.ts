import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ISiglaValoracionesRepository } from '@/features/valoraciones/domain/ports';
import type { PdfPrinter } from '@/features/musculoesqueletica-pdf/domain/entities';
import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import { makeRepFacturacion } from '@/features/valoraciones/domain/fixtures';

/**
 * POST /api/valoraciones/pdf (REQ-03 E-R1/E-R2). The repository and the
 * printer are injected through their test seams — no SQL, no browser.
 */

const filtroValido = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/valoraciones/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/valoraciones/pdf', () => {
  let fakeRepo: ISiglaValoracionesRepository;
  let fakePrinter: PdfPrinter;
  const printMock = vi.fn();

  beforeEach(async () => {
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    const { __setValoracionesPdfPrinterForTests } = await import(
      '@/features/valoraciones/infrastructure/pdf/HtmlValoracionPdfPrinter'
    );

    fakeRepo = {
      buscarValoraciones: vi
        .fn()
        .mockResolvedValue([makeRepFacturacion({ DesDes: 'SEDE NORTE', VVtaMN: 100 })]),
      buscarConsolidado: vi.fn(),
      buscarClientes: vi.fn(),
      buscarPacientes: vi.fn(),
      buscarDestinos: vi.fn(),
      buscarTiposTrabajador: vi.fn(),
      buscarSedes: vi.fn(),
      buscarClientePorCodigo: vi
        .fn()
        .mockResolvedValue({ codCli: 55, nomCom: 'EMPRESA DEMO S.A.C.', nroRuc: '20512345678' }),
    } as unknown as ISiglaValoracionesRepository;

    printMock.mockReset();
    printMock.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    fakePrinter = { print: printMock } as unknown as PdfPrinter;

    __setValoracionesDbForTests(fakeRepo);
    __setValoracionesPdfPrinterForTests(fakePrinter);
  });

  it('returns PDF bytes with inline download headers (E-R1)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, codCli: 55 }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline');
    expect(res.headers.get('content-disposition')).toContain('valoraciones_2026-01-01_2026-01-31.pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('re-queries from the posted filter and renders the membrete HTML through the printer (D4)', async () => {
    const { POST } = await import('../route');
    await POST(makeRequest({ ...filtroValido, codCli: 55 }));

    expect(fakeRepo.buscarValoraciones).toHaveBeenCalledTimes(1);
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado).toMatchObject({ fecIni: '2026-01-01', fecFin: '2026-01-31', codCli: 55, codMon: 1 });

    expect(printMock).toHaveBeenCalledTimes(1);
    const html = printMock.mock.calls[0][0] as string;
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(html).toContain('RUC: 20556200328');
    expect(html).toContain('EMPRESA DEMO S.A.C.');
    expect(html).toContain('20512345678');
    expect(html).toContain('SEDE NORTE');
    expect(html).toContain('size: A4');
    // Footer numbering: the route prints through `HtmlValoracionPdfPrinter`
    // (factory default), which applies the spike-validated footer overrides
    // itself — proven in HtmlValoracionPdfPrinter.test.ts.
  });

  it('rejects an invalid period with 400 and never queries', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, fecIni: '2026-02-01', fecFin: '2026-01-31' }));

    expect(res.status).toBe(400);
    expect(fakeRepo.buscarValoraciones).not.toHaveBeenCalled();
    expect(printMock).not.toHaveBeenCalled();
  });

  it('maps EdgeUnavailableError to 502 with a user-safe message (E-R2 scenario)', async () => {
    printMock.mockRejectedValue(new EdgeUnavailableError('no edge on host'));
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('PDF');
    expect(body.error).not.toContain('msedge');
    expect(body.error).not.toContain('EdgeUnavailable');
    expect(body.stack).toBeUndefined();
  });

  it('maps other printer/repository failures to a user-safe 500 (no internals)', async () => {
    printMock.mockRejectedValue(new Error('EDGEOOM at chromium.cc:42'));
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('chromium');
    expect(body.error).not.toContain('EDGEOOM');
  });
});
