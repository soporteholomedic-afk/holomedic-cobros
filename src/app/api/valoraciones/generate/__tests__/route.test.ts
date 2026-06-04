import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock utils before importing route ----

const mockParseCsv = vi.hoisted(() => vi.fn());
const mockGenerateWorkbook = vi.hoisted(() => vi.fn());

vi.mock('@/utils/valoraciones', () => ({
  parseValoracionesCsvContent: mockParseCsv,
  generateValoracionesWorkbook: mockGenerateWorkbook,
}));

// ---- Import the handler being tested ----

import { POST } from '../route';

// ---- Helpers ----

function toBuffer(uint8: Uint8Array): Buffer {
  return Buffer.from(uint8);
}

function createMockRequest(body?: FormData): Request {
  return {
    formData: () => Promise.resolve(body ?? new FormData()),
  } as Request;
}

const CSV_SAMPLE =
  'facturar a,contratades,proyectodes,cr_proy,dociden,nombre,edad,Fecha de Nacimiento,ocupacion,tipotrab,feorden,fesoliciTramAdm,tipo_examen,perfil,resultado,anexo7d,total,solicitado,administrador,ficha,item,tcompro,nrodoc,nrovalor,ordpedi,cod_em,fec_rec,cancela,sede_cob,nro_cob\n' +
  'ARELLANO INVESTIGACION DE MARKETING S.A.,ARELLANO INVESTIGACION DE MARKETING S.A.,ARELLANO INVESTIGACION DE MARKETING S.A.,ARELLANO INVESTIGACION DE MARKETING S.A.,DNI 71125522,SANCHEZ TORRES JORGE DAVID,25,19/05/2000,ASISTENTE DE RRHH,EMPLEADO,24/01/2026,,PREOCUPACIONAL,P. PUESTOS DE TRABAJO  ADMINISTRATIVOS,,NO,141.00,VALENTINA ROSAS,,Id: 012106466,0';

function formDataWithFile(content: string, filename = 'archivos-crudos.csv'): FormData {
  const fd = new FormData();
  const blob = new Blob([content], { type: 'text/csv' });
  fd.append('file', blob, filename);
  return fd;
}

// ---- Tests ----

describe('POST /api/valoraciones/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver 200 con Content-Type xlsx cuando la generación es exitosa', async () => {
    const fakeBuffer = Buffer.from('fake-xlsx-content');
    mockParseCsv.mockReturnValue({ companies: [] });
    mockGenerateWorkbook.mockReturnValue(fakeBuffer);

    const response = await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="valoraciones_por_empresa_\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );

    const body = toBuffer(await response.arrayBuffer());
    expect(body.equals(fakeBuffer)).toBe(true);
  });

  it('debe llamar a parseValoracionesCsvContent con el contenido del CSV', async () => {
    mockParseCsv.mockReturnValue({ companies: [] });
    mockGenerateWorkbook.mockReturnValue(Buffer.from(''));

    await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));

    expect(mockParseCsv).toHaveBeenCalledTimes(1);
    expect(mockParseCsv).toHaveBeenCalledWith(CSV_SAMPLE);
  });

  it('debe pasar el resultado de parseCsv a generateWorkbook', async () => {
    const groupedData = {
      companies: [
        { company: 'ARELLANO', rows: [], subtotal: 141, igv: 25.38, total: 166.38 },
      ],
    };
    mockParseCsv.mockReturnValue(groupedData);
    mockGenerateWorkbook.mockReturnValue(Buffer.from(''));

    await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));

    expect(mockGenerateWorkbook).toHaveBeenCalledWith(groupedData);
  });

  it('debe devolver 400 si no se envía archivo', async () => {
    const response = await POST(createMockRequest(new FormData()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('No se proporcionó un archivo CSV');
  });

  it('debe devolver 500 cuando parseValoracionesCsvContent falla', async () => {
    mockParseCsv.mockImplementation(() => {
      throw new Error('Error de parseo');
    });

    const response = await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Error de parseo');
  });

  it('debe devolver 500 cuando generateWorkbook falla', async () => {
    mockParseCsv.mockReturnValue({ companies: [] });
    mockGenerateWorkbook.mockImplementation(() => {
      throw new Error('Workbook generation failed');
    });

    const response = await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Workbook generation failed');
  });

  it('debe devolver 500 para errores no-Error', async () => {
    mockParseCsv.mockImplementation(() => {
      throw 'String error';
    });

    const response = await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('An unexpected error occurred');
  });

  // ---- Company filter tests ----

  const multiCompanyData = {
    companies: [
      { company: 'EMPRESA A', rows: [], subtotal: 100, igv: 18, total: 118 },
      { company: 'EMPRESA B', rows: [], subtotal: 200, igv: 36, total: 236 },
      { company: 'EMPRESA C', rows: [], subtotal: 300, igv: 54, total: 354 },
    ],
  };

  it('debe filtrar por company cuando se proporciona el campo (case-insensitive)', async () => {
    mockParseCsv.mockReturnValue(multiCompanyData);
    mockGenerateWorkbook.mockReturnValue(Buffer.from(''));

    const fd = formDataWithFile(CSV_SAMPLE);
    fd.append('company', 'EMPRESA B');
    await POST(createMockRequest(fd));

    expect(mockGenerateWorkbook).toHaveBeenCalledWith({
      companies: [
        { company: 'EMPRESA B', rows: [], subtotal: 200, igv: 36, total: 236 },
      ],
    });
  });

  it('debe devolver companies vacío cuando company no coincide con ninguna', async () => {
    mockParseCsv.mockReturnValue(multiCompanyData);
    mockGenerateWorkbook.mockReturnValue(Buffer.from(''));

    const fd = formDataWithFile(CSV_SAMPLE);
    fd.append('company', 'NOEXISTE');
    await POST(createMockRequest(fd));

    expect(mockGenerateWorkbook).toHaveBeenCalledWith({
      companies: [],
    });
  });

  it('debe pasar todos los companies cuando no se proporciona company', async () => {
    mockParseCsv.mockReturnValue(multiCompanyData);
    mockGenerateWorkbook.mockReturnValue(Buffer.from(''));

    await POST(createMockRequest(formDataWithFile(CSV_SAMPLE)));

    // Unfiltered — the full multiCompanyData passes through
    expect(mockGenerateWorkbook).toHaveBeenCalledWith(multiCompanyData);
  });

  it('debe usar filename con company cuando se filtra', async () => {
    mockParseCsv.mockReturnValue(multiCompanyData);
    mockGenerateWorkbook.mockReturnValue(Buffer.from('fake-xlsx-content'));

    const fd = formDataWithFile(CSV_SAMPLE);
    fd.append('company', 'EMPRESA B');
    const response = await POST(createMockRequest(fd));

    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="valoraciones_EMPRESA B_\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
  });
});
