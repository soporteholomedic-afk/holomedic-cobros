import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import type { PdfPrinter } from '@/features/musculoesqueletica-pdf/domain/entities';
import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import type { ISiglaValoracionesRepository } from '@/features/valoraciones/domain/ports';
import { makeRepFacturacion } from '@/features/valoraciones/domain/fixtures';
import { __setValoracionesPdfPrinterForTests } from '@/features/valoraciones/infrastructure/pdf/HtmlValoracionPdfPrinter';
import { __setValoracionesDbForTests } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import { sendEmail, type SendEmailParams } from '@/utils/sendEmail';

/**
 * POST /api/valoraciones/send (REQ-03 M-R1/M-R4, design D4/D5).
 *
 * FormData contract (no operator file uploads — attachments regenerate
 * server-side from the posted filter):
 *   filtro       — JSON string of the ValoracionesFilter
 *   to           — comma-separated recipients (required)
 *   cc           — comma-separated copies (optional)
 *   subject/html — required non-empty
 *   adjuntarPdf / adjuntarExcel — 'true' | 'false' (default 'false')
 *
 * `sendEmail` is mocked at the module boundary; the repository and PDF
 * printer are injected through their test seams (pdf-route precedent).
 */
vi.mock('@/utils/sendEmail', () => ({ sendEmail: vi.fn() }));

const sendEmailMock = vi.mocked(sendEmail);

const filtroValido = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
  codCli: 55,
};

function makeRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    fd.append(name, value);
  }
  return new Request('http://localhost/api/valoraciones/send', { method: 'POST', body: fd });
}

const baseFields: Record<string, string> = {
  filtro: JSON.stringify(filtroValido),
  to: 'facturas@demo.com.pe',
  subject: 'Valorización enero 2026',
  html: '<p>Estimados, adjuntamos la valorización.</p>',
};

describe('POST /api/valoraciones/send', () => {
  const printMock = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    sendEmailMock.mockReset();

    const fakeRepo = {
      buscarValoraciones: vi
        .fn()
        .mockResolvedValue([makeRepFacturacion({ DesDes: 'SEDE NORTE', VVtaMN: 100 })]),
      buscarClientePorCodigo: vi
        .fn()
        .mockResolvedValue({ codCli: 55, nomCom: 'EMPRESA DEMO S.A.C.', nroRuc: '20512345678' }),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);

    printMock.mockReset();
    printMock.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
    __setValoracionesPdfPrinterForTests({ print: printMock } as unknown as PdfPrinter);
  });

  it('dispatches through sendEmail with purpose facturacion and BOTH regenerated attachments (M-R1/M-R4)', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<abc@demo>' });
    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ ...baseFields, adjuntarPdf: 'true', adjuntarExcel: 'true' }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; messageId: string };
    expect(json).toEqual({ success: true, messageId: '<abc@demo>' });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const params = sendEmailMock.mock.calls[0][0] as SendEmailParams;
    expect(params.purpose).toBe('facturacion');
    expect(params.to).toEqual(['facturas@demo.com.pe']);
    expect(params.subject).toBe('Valorización enero 2026');
    expect(params.attachments).toHaveLength(2);
    const [pdf, excel] = params.attachments!;
    expect(pdf.filename).toBe('valoraciones_2026-01-01_2026-01-31.pdf');
    expect(pdf.contentType).toBe('application/pdf');
    expect(Buffer.from(pdf.content as Buffer)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(excel.filename).toBe('valoraciones_2026-01-01_2026-01-31.xlsx');
    expect(excel.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // Non-empty xlsx bytes (ZIP local-file header magic 'PK').
    expect(excel.content).toBeDefined();
    expect((excel.content as Buffer).length).toBeGreaterThan(4);
    expect((excel.content as Buffer).subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('regenerates the PDF from the posted filter (D4) — printer receives the membrete HTML', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const { POST } = await import('../route');
    await POST(makeRequest({ ...baseFields, adjuntarPdf: 'true' }));

    expect(printMock).toHaveBeenCalledTimes(1);
    const html = printMock.mock.calls[0][0] as string;
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(html).toContain('SEDE NORTE');
  });

  it('scopes BOTH attachments to the posted empresa and names them [Empresa]_[fecIni] (U6)', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const fakeRepo = {
      buscarValoraciones: vi.fn().mockResolvedValue([
        makeRepFacturacion({ NomCFa: 'EMPRESA DEMO S.A.C.', NomCom: 'EMPRESA DEMO S.A.C.', Pacien: 'PACIENTE DEMO', DesDes: 'SEDE NORTE', VVtaMN: 100 }),
        makeRepFacturacion({ NomCFa: 'OTRA EMPRESA SRL', NomCom: 'OTRA EMPRESA SRL', Pacien: 'PACIENTE OTRA', DesDes: 'SEDE SUR', VVtaMN: 200 }),
      ]),
      buscarClientePorCodigo: vi.fn().mockResolvedValue(null),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);

    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ ...baseFields, adjuntarPdf: 'true', adjuntarExcel: 'true', empresa: 'OTRA EMPRESA SRL' }),
    );
    expect(res.status).toBe(200);

    const params = sendEmailMock.mock.calls[0][0] as SendEmailParams;
    const [pdf, excel] = params.attachments!;
    expect(pdf.filename).toBe('OTRA EMPRESA SRL_2026-01-01.pdf');
    expect(excel.filename).toBe('OTRA EMPRESA SRL_2026-01-01.xlsx');

    // PDF html carries ONLY the scoped empresa's rows.
    const html = printMock.mock.calls[0][0] as string;
    expect(html).toContain('PACIENTE OTRA');
    expect(html).not.toContain('PACIENTE DEMO');

    // Excel attachment carries ONLY the scoped empresa's row (exceljs flat
    // layout: header at absolute row 7, data starting at row 8).
    const wb = XLSX.read(Buffer.from(excel.content as Buffer), { type: 'buffer' });
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
    expect(String(absolute[7][5])).toBe('PACIENTE OTRA'); // first data row (sheet row 8)
    expect(String(absolute[8][5])).not.toBe('PACIENTE DEMO'); // scoped only
  });

  it('rejects an invalid empresa with 400 VALIDATION_ERROR and sends nothing (U6)', async () => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...baseFields, empresa: 'x'.repeat(201) }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('splits comma-joined to/cc and sends cc through (M-R3 prefill shape)', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({ ...baseFields, to: 'a@demo.com, b@demo.com', cc: 'c@demo.com' }),
    );
    expect(res.status).toBe(200);
    const params = sendEmailMock.mock.calls[0][0] as SendEmailParams;
    expect(params.to).toEqual(['a@demo.com', 'b@demo.com']);
    expect(params.cc).toEqual(['c@demo.com']);
  });

  it('omits attachments entirely when both flags are absent', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const { POST } = await import('../route');
    await POST(makeRequest(baseFields));
    const params = sendEmailMock.mock.calls[0][0] as SendEmailParams;
    expect(params.attachments).toBeUndefined();
  });

  it('maps SMTP_TIMEOUT to 503 with the safe code (user-safe failure, M-R1)', async () => {
    sendEmailMock.mockResolvedValue({
      success: false,
      code: 'SMTP_TIMEOUT',
      error: 'SMTP connection timed out',
    });
    const { POST } = await import('../route');
    const res = await POST(makeRequest(baseFields));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { success: boolean; code: string; error: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('SMTP_TIMEOUT');
  });

  it('maps SMTP_AUTH_ERROR/SMTP_ERROR to 500 with the transport code', async () => {
    sendEmailMock.mockResolvedValue({
      success: false,
      code: 'SMTP_AUTH_ERROR',
      error: 'SMTP authentication failed',
    });
    const { POST } = await import('../route');
    const res = await POST(makeRequest(baseFields));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('SMTP_AUTH_ERROR');
  });

  it('maps EdgeUnavailableError (attachment rendering) to 502 user-safe', async () => {
    printMock.mockRejectedValue(new EdgeUnavailableError('no edge on host'));
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...baseFields, adjuntarPdf: 'true' }));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('PDF');
    expect(json.error).not.toContain('msedge');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('repository failure → user-safe 500, no SP/internal leakage, nothing sent', async () => {
    const fakeRepo = {
      buscarValoraciones: vi.fn().mockRejectedValue(new Error('EXECUTE permission denied on SP_RPT_REPFACTURACION')),
      buscarClientePorCodigo: vi.fn(),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...baseFields, adjuntarExcel: 'true' }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).not.toContain('SP_RPT');
    expect(json.error).not.toContain('permission');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing to', { to: undefined }],
    ['invalid to email', { to: 'not-an-email' }],
    ['empty recipients after split', { to: ' , ' }],
    ['invalid cc email', { cc: 'bad-cc' }],
    ['more than 10 recipients', { to: Array.from({ length: 11 }, (_, i) => `r${i}@demo.com`).join(',') }],
    ['missing subject', { subject: '' }],
    ['missing html', { html: '' }],
  ])('400 VALIDATION_ERROR on %s', async (_label, overrides) => {
    const { POST } = await import('../route');
    // `undefined` values drop the key entirely (missing-field cases).
    const fields = Object.fromEntries(
      Object.entries({ ...baseFields, ...overrides }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    const res = await POST(makeRequest(fields));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing filtro field', { filtro: '' }],
    ['non-JSON filtro', { filtro: 'not-json' }],
    ['inverted period', { filtro: JSON.stringify({ ...filtroValido, fecIni: '2026-03-01', fecFin: '2026-01-31' }) }],
    ['missing codMon', { filtro: JSON.stringify({ fecIni: '2026-01-01', fecFin: '2026-01-31' }) }],
  ])('400 VALIDATION_ERROR on %s', async (_label, overrides) => {
    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...baseFields, ...overrides }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('rejects a non-multipart body with 400', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      new Request('http://localhost/api/valoraciones/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseFields),
      }),
    );
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // ---- ocultarCero DTO flag (filtro-valores-cero, S17/S18/S19) ----

  it('carries ocultarCero=true into the attachment re-query so the email matches the screen (S17)', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const fakeRepo = {
      buscarValoraciones: vi.fn().mockResolvedValue([makeRepFacturacion({ VVtaMN: 100 })]),
      buscarClientePorCodigo: vi.fn().mockResolvedValue(null),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);

    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({
        ...baseFields,
        adjuntarExcel: 'true',
        filtro: JSON.stringify({ ...filtroValido, ocultarCero: true }),
      }),
    );

    expect(res.status).toBe(200);
    expect(fakeRepo.buscarValoraciones).toHaveBeenCalledTimes(1);
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado.ocultarCero).toBe(true);
  });

  it('keeps the attachment filter unchanged when the flag is absent (S18)', async () => {
    sendEmailMock.mockResolvedValue({ success: true, messageId: '<x>' });
    const fakeRepo = {
      buscarValoraciones: vi.fn().mockResolvedValue([makeRepFacturacion({ VVtaMN: 100 })]),
      buscarClientePorCodigo: vi.fn().mockResolvedValue(null),
    } as unknown as ISiglaValoracionesRepository;
    __setValoracionesDbForTests(fakeRepo);

    const { POST } = await import('../route');
    const res = await POST(makeRequest({ ...baseFields, adjuntarExcel: 'true' }));

    expect(res.status).toBe(200);
    expect(fakeRepo.buscarValoraciones).toHaveBeenCalledTimes(1);
    const filtroUsado = (fakeRepo.buscarValoraciones as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(filtroUsado.ocultarCero).toBe(false);
  });

  it('rejects a non-boolean ocultarCero with 400 BEFORE any repo query or email dispatch (S19)', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      makeRequest({
        ...baseFields,
        adjuntarExcel: 'true',
        filtro: JSON.stringify({ ...filtroValido, ocultarCero: 1 }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string; error: string };
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.error).toContain('ocultarCero');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
