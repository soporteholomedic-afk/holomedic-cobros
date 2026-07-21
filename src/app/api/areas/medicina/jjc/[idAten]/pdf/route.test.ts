import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import type { AtencionDetalle, JjcEvaluacion } from '@/types/jjc';

// ---- Mocks ----

const mockGetExecute = vi.fn();
const mockLoadExecute = vi.fn();

vi.mock('@/features/jjc-mapper/composition/container', () => ({
  buildGetAtencionDetalle: () => ({ execute: mockGetExecute }),
  buildLoadJjcEvaluacion: () => ({ execute: mockLoadExecute }),
}));

vi.mock('@pdf-lib/fontkit', () => ({ default: {} }));

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
  'txt_tipo_fototipo',
  'txt_fecha',
  'txt_count_lunar',
  'txt_count_mancha',
  'txt_count_peca',
  'txt_count_cicatriz',
  'txt_count_otras',
];

const CHECKBOX_NAMES = [
  ...Array.from({ length: 11 }, (_, i) => `cbk_${i + 1}_si`),
  ...Array.from({ length: 11 }, (_, i) => `cbk_${i + 1}_no`),
  // Preguntas 12-13 use letter keys in the real template.
  'cbk_M-1_si',
  'cbk_M-1_no',
  'cbk_M-2_si',
  'cbk_M-2_no',
];

const RESPONSE_FIELDS = [
  // The real template only has detail fields for preguntas 1, 2, 5, 6, 7, 9.
  // Preguntas 3, 4, 8, 10, 11 have no detail slot.
  'txt_1_response',
  'txt_2-1_response',
  'txt_5_response',
  'txt_6_response',
  'txt_7_response',
  'txt_9_response',
  // Pregunta 2 also has a paired date slot: `txt_2-2_response`.
  'txt_2-2_response',
];

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

  // Chunked text slots — must match the real AcroForm field names in
  // `public/PLANTILLA_JJC_MEDICINA.pdf` so the integration test below stays
  // faithful to the real template.
  form.createTextField('Observaciones 1');
  form.createTextField('Observaciones 2');
  form.createTextField('Observaciones 3');
  form.createTextField('Describa en caso de tener alguna respuesta positiva 1');
  form.createTextField('Describa en caso de tener alguna respuesta positiva 2');

  return pdfDoc.save();
}

let templateBytes: Uint8Array;
let realTemplateBytes: Uint8Array | null = null;

const REAL_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public',
  'PLANTILLA_JJC_MEDICINA.pdf',
);

beforeAll(async () => {
  templateBytes = await createTemplatePdf();
  if (fs.existsSync(REAL_TEMPLATE_PATH)) {
    realTemplateBytes = new Uint8Array(fs.readFileSync(REAL_TEMPLATE_PATH));
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(fs, 'readFileSync').mockImplementation(((
    filePath: fs.PathOrFileDescriptor,
  ) => {
    const p = String(filePath);
    if (p.includes('Tahoma')) {
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return templateBytes as unknown as ReturnType<typeof fs.readFileSync>;
  }) as unknown as typeof fs.readFileSync);
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
      params: Promise.resolve({ idAten: '01234567' }),
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
      params: Promise.resolve({ idAten: '01234567' }),
    });

    expect(res.status).toBe(200);
    await assertValidPdf(res);
  });

  it('returns 200 when evaluacion errors (non-blocking)', async () => {
    mockGetExecute.mockResolvedValue(sampleAtencion);
    mockLoadExecute.mockResolvedValue({ ok: false, data: null, error: 'DB error' });

    const res = await GET(createRequest('01234567'), {
      params: Promise.resolve({ idAten: '01234567' }),
    });

    expect(res.status).toBe(200);
    await assertValidPdf(res);
  });

  it('returns 404 when atencion is not found', async () => {
    mockGetExecute.mockResolvedValue(null);

    const res = await GET(createRequest('01234567'), {
      params: Promise.resolve({ idAten: '01234567' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('atencion_not_found');
  });

  it('returns 502 when atencion use case throws (DB unreachable)', async () => {
    mockGetExecute.mockRejectedValue(new Error('connect ECONNREFUSED 172.16.10.10:1433'));

    const res = await GET(createRequest('01234567'), {
      params: Promise.resolve({ idAten: '01234567' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('database_unavailable');
  });
});

// ---- Integration: real PLANTILLA_JJC_MEDICINA.pdf ----
//
// This test loads the actual template that ships in `public/`, runs the route
// against mocked use cases, and asserts that:
//   1. The route returns a 200 with a valid PDF body.
//   2. Every field name that `mapAtencionToPdfFields` produces exists in the
//      real AcroForm. This catches future drift if the template is edited
//      and field names change without a code update.
//   3. The result is a flattened PDF (no editable fields left).

describe('GET /api/areas/medicina/jjc/[idAten]/pdf — real template integration', () => {
  it('fills the real PLANTILLA_JJC_MEDICINA.pdf without errors', async () => {
    // Skip if the real template is not present (e.g., in a CI sandbox without
    // public assets). The synthetic-PDF tests above still cover the route logic.
    if (!realTemplateBytes) {
      return;
    }

    const realDoc = await PDFDocument.load(realTemplateBytes);
    const realFieldNames = new Set(realDoc.getForm().getFields().map((f) => f.getName()));

    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      realTemplateBytes as unknown as ReturnType<typeof fs.readFileSync>,
    );

    const fullEval: JjcEvaluacion = {
      ...sampleEval,
      observaciones: 'Paciente con antecedentes de dermatitis. Control en 6 meses.',
      lesiones: [
        { id: 'p1', type: 'L', x: 0.3, y: 0.5 },
        { id: 'p2', type: 'L', x: 0.5, y: 0.3 },
        { id: 'p3', type: 'M', x: 0.7, y: 0.4 },
      ],
      preguntas: {
        sufreEnfermedadesPiel: { respuesta: 'si', detalle: 'dermatitis atópica' },
        tieneLesionActual: { respuesta: 'no', detalle: '', fecha: '15/06/2026' },
        cambioColoracion: { respuesta: null, detalle: '' },
        lesionesRepiten: { respuesta: 'si', detalle: 'en codos' },
        enrojecimiento: { respuesta: null, detalle: '' },
        comezon: { respuesta: null, detalle: '' },
        hinchazon: { respuesta: null, detalle: '' },
        rinitisAsma: { respuesta: null, detalle: '' },
        usaEPP: { respuesta: 'si', detalle: 'guantes y lentes' },
        cambiosUnas: { respuesta: null, detalle: '' },
        tomaMedicacion: { respuesta: null, detalle: '' },
        describaPositivo: 'Mejoría con el tratamiento actual.',
        lesionDermatopatia: null,
        evaluacionDermatologo: null,
      },
    };

    mockGetExecute.mockResolvedValue(sampleAtencion);
    mockLoadExecute.mockResolvedValue({ ok: true, data: fullEval, error: null });

    const res = await GET(createRequest('01234567'), {
      params: Promise.resolve({ idAten: '01234567' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');

    const resultDoc = await assertValidPdf(res);

    // The form should be flattened — no editable fields left in the result.
    expect(resultDoc.getForm().getFields()).toHaveLength(0);

    // Cross-check: every field name the mapper produces must exist in the real
    // template. This catches drift if the template is edited and the mapper
    // is not updated in lockstep.
    const { mapAtencionToPdfFields } = await import('./mapAtencionToPdfFields');
    const fieldMap = mapAtencionToPdfFields(sampleAtencion, fullEval);
    const producedNames = [
      ...Object.keys(fieldMap.text),
      ...Object.keys(fieldMap.checks),
      ...Object.keys(fieldMap.chunks).flatMap((prefix) =>
        fieldMap.chunks[prefix].map((_, i) => `${prefix} ${i + 1}`),
      ),
    ];
    for (const name of producedNames) {
      expect(realFieldNames.has(name), `Real template is missing field: ${name}`).toBe(true);
    }
  });
});
