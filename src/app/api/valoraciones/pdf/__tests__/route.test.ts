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

  it('returns PDF bytes with attachment headers and the [Empresa]_[fecIni].pdf filename (U6)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, codCli: 55, empresa: 'EMPRESA DEMO S.A.C.' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('filename="EMPRESA DEMO S.A.C._2026-01-01.pdf"');
    // RFC 5987 UTF-8 companion for accented names.
    expect(disposition).toContain("filename*=UTF-8''");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the legacy valoraciones filename for clientless exports (no empresa field)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest(filtroValido));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain(
      'filename="valoraciones_2026-01-01_2026-01-31.pdf"',
    );
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

  it('rejects an invalid empresa with 400 and never queries (U6)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...filtroValido, empresa: 77 }));

    expect(res.status).toBe(400);
    expect(fakeRepo.buscarValoraciones).not.toHaveBeenCalled();
    expect(printMock).not.toHaveBeenCalled();
  });

  it('scopes the re-queried rows to the posted empresa group key (U6, D4 kept)', async () => {
    (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeRepFacturacion({ NomCFa: 'EMPRESA DEMO S.A.C.', Pacien: 'PACIENTE DEMO', DesDes: 'SEDE NORTE' }),
      makeRepFacturacion({ NomCFa: 'OTRA EMPRESA SRL', NomCli: 'OTRA EMPRESA SRL', Pacien: 'PACIENTE OTRA', DesDes: 'SEDE SUR' }),
    ]);
    const { POST } = await import('../route');
    await POST(makeRequest({ ...filtroValido, empresa: 'OTRA EMPRESA SRL' }));

    // Re-query still receives the BASE filter (empresa never reaches the SP).
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado.fecIni).toBe('2026-01-01');
    expect(filtroUsado).not.toHaveProperty('empresa');

    const html = printMock.mock.calls[0][0] as string;
    // Only the scoped empresa's rows survive into the document.
    expect(html).toContain('PACIENTE OTRA');
    expect(html).not.toContain('PACIENTE DEMO');
    // Client header reflects the scoped empresa, not the codCli lookup name.
    expect(html).toContain('OTRA EMPRESA SRL');
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
