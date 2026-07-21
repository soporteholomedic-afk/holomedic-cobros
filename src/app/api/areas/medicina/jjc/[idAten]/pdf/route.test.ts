import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import type { AtencionDetalle, JjcEvaluacion } from '@/types/jjc';

// ---- Mocks ----

const mockGetExecute = vi.fn();
const mockLoadExecute = vi.fn();

vi.mock('@/features/jjc-mapper/composition/container', () => ({
  buildGetAtencionDetalle: () => ({ execute: mockGetExecute }),
  buildLoadJjcEvaluacion: () => ({ execute: mockLoadExecute }),
}));

// ---- Template PDF factory ----
// Creates a minimal PDF with AcroForm fields matching the route's expectations.

const TEXT_FIELDS = [
  'txt_dni',
  'txt_nombre_completo',
  'txt_empresa',
  'txt_ocupacion',
  'txt_area',
  'txt_fecha_examen',
  'txt_lugar',
  'txt_fototipo',
  'txt_count_lunar',
  'txt_count_mancha',
  'txt_count_peca',
  'txt_count_cicatriz',
];

const CHECKBOX_NAMES = [
  ...Array.from({ length: 13 }, (_, i) => `cbk_${i + 1}_si`),
  ...Array.from({ length: 13 }, (_, i) => `cbk_${i + 1}_no`),
];

const RESPONSE_FIELDS = Array.from({ length: 11 }, (_, i) => `txt_${i + 1}_response`);

async function createTemplatePdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595, 842]); // A4

  const form = pdfDoc.getForm();

  for (const name of TEXT_FIELDS) {
    form.createTextField(name);
  }
  for (const name of CHECKBOX_NAMES) {
    form.createCheckBox(name);
  }
  for (const name of RESPONSE_FIELDS) {
    form.createTextField(name);
  }

  // Chunked text slots
  form.createTextField('Observaciones 1');
  form.createTextField('Observaciones 2');
  form.createTextField('Observaciones 3');
  form.createTextField('DescribaPositiva 1');
  form.createTextField('DescribaPositiva 2');

  return pdfDoc.save();
}

let templateBytes: Uint8Array;

beforeAll(async () => {
  templateBytes = await createTemplatePdf();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(fs, 'readFileSync').mockReturnValue(templateBytes);
});

// ---- Import under test ----

const { GET } = await import('./route');

// ---- Helpers ----

function createRequest(idAten: string): Request {
  return new Request(
    `http://localhost/api/areas/medicina/jjc/${idAten}/pdf`,
    { method: 'GET' },
  );
}

/**
 * Asserts the response body is a valid PDF with content.
 */
async function assertValidPdf(res: Response): Promise<PDFDocument> {
  const body = await res.arrayBuffer();
  expect(body.byteLength).toBeGreaterThan(100);
  const pdfDoc = await PDFDocument.load(new Uint8Array(body));
  expect(pdfDoc.getPageCount()).toBeGreaterThan(0);
  return pdfDoc;
}

const sampleAtencion: AtencionDetalle = {
  idAtencion: '01234567',
  dni: '40123456',
  paciente: 'Juan Pérez',
  sexo: 'M',
  fechaNac: '15/03/1990',
  edad: 36,
  fechaAtencion: '21/07/2026',
  empresa: 'TechCorp S.A.',
  tipoExamen: 'Pre-Ocupacional',
  puesto: 'Ingeniero',
  area: 'Producción',
};

const sampleEval: JjcEvaluacion = {
  idAtencion: '01234567',
  fechaEvaluacion: '2026-07-21',
  lugar: 'HOLOMEDIC',
  fototipo: 'III-IV',
  observaciones: 'Paciente en buen estado general.',
  lesiones: [
    { id: 'p1', type: 'L', x: 0.3, y: 0.5 },
    { id: 'p2', type: 'L', x: 0.5, y: 0.3 },
  ],
  preguntas: null,
};

// ---- Tests ----

describe('GET /api/areas/medicina/jjc/[idAten]/pdf', () => {
  it('returns 200 with PDF for valid idAten', async () => {
    mockGetExecute.mockResolvedValue(sampleAtencion);
    mockLoadExecute.mockResolvedValue({ ok: true, data: sampleEval, error: null });

    const res = await GET(createRequest('01234567'), {
      params: { idAten: '01234567' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="jjc-01234567.pdf"',
    );

    await assertValidPdf(res);
  });

  it('returns 200 with PDF when evaluation is missing (optional)', async () => {
    mockGetExecute.mockResolvedValue(sampleAtencion);
    mockLoadExecute.mockResolvedValue({ ok: true, data: null, error: null });

    const res = await GET(createRequest('01234567'), {
      params: { idAten: '01234567' },
    });

    expect(res.status).toBe(200);
    await assertValidPdf(res);
  });

  it('returns 200 when evaluacion errors (non-blocking)', async () => {
    mockGetExecute.mockResolvedValue(sampleAtencion);
    mockLoadExecute.mockResolvedValue({ ok: false, data: null, error: 'DB error' });

    const res = await GET(createRequest('01234567'), {
      params: { idAten: '01234567' },
    });

    expect(res.status).toBe(200);
    await assertValidPdf(res);
  });

  it('returns 404 when atencion is not found', async () => {
    mockGetExecute.mockResolvedValue(null);

    const res = await GET(createRequest('01234567'), {
      params: { idAten: '01234567' },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('atencion_not_found');
  });

  it('returns 502 when atencion use case throws (DB unreachable)', async () => {
    mockGetExecute.mockRejectedValue(new Error('connect ECONNREFUSED 172.16.10.10:1433'));

    const res = await GET(createRequest('01234567'), {
      params: { idAten: '01234567' },
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('database_unavailable');
  });
});
