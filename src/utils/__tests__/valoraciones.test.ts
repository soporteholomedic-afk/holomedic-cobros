import { describe, it, expect } from 'vitest';
import { parseValoracionesCsvContent, generateValoracionesWorkbook } from '../valoraciones';
import * as XLSX from 'xlsx';
import type { GroupedData } from '../valoraciones';

const SAMPLE_CSV = `facturar a,contratades,proyectodes,cr_proy,dociden,nombre,edad,Fecha de Nacimiento,ocupacion,tipotrab,feorden,tipo_examen,perfil,solicitado,total
EMPRESA A,CONTRAT A,PROYECTO A,CR A,DNI 12345678,JUAN PEREZ,30,15/05/1995,INGENIERO,EMPLEADO,01/01/2026,PREOCUPACIONAL,PERFIL A,SOLICITANTE A,150.00
EMPRESA A,CONTRAT A,PROYECTO A,CR A,DNI 12345678,JUAN PEREZ,30,15/05/1995,INGENIERO,EMPLEADO,01/01/2026,RX COLUMNA,PERFIL A,SOLICITANTE A,75.50
EMPRESA A,CONTRAT A,PROYECTO A,CR A,DNI 87654321,MARIA GARCIA,25,10/03/2000,CONTADORA,EMPLEADO,02/01/2026,PREOCUPACIONAL,PERFIL B,SOLICITANTE B,200.00
EMPRESA B,CONTRAT B,PROYECTO B,CR B,DNI 55555555,CARLOS LOPEZ,40,20/08/1983,OPERADOR,EMPLEADO,03/01/2026,PREOCUPACIONAL,PERFIL C,SOLICITANTE C,300.00
EMPRESA A,CONTRAT A,PROYECTO A,CR A,DNI 12345678,JUAN PEREZ,30,15/05/1995,INGENIERO,EMPLEADO,01/01/2026,OTRO EXAMEN,PERFIL A,SOLICITANTE A,0.00
EMPRESA A,CONTRAT A,PROYECTO A,CR A,DNI 12345678,JUAN PEREZ,30,15/05/1995,INGENIERO,EMPLEADO,01/01/2026,OTRO MAS,PERFIL A,SOLICITANTE A,`;

// ---- Tests for parseValoracionesCsvContent ----

describe('parseValoracionesCsvContent', () => {
  it('should filter out non-numeric rows and group remaining by company (include zero-cost)', () => {
    const result = parseValoracionesCsvContent(SAMPLE_CSV);

    // EMPRESA A: 150.00 + 75.50 + 200.00 + 0.00 = 425.50 (empty row filtered out)
    const empresaA = result.companies.find(c => c.company === 'EMPRESA A');
    expect(empresaA).toBeDefined();
    expect(empresaA!.rows).toHaveLength(4);
    expect(empresaA!.subtotal).toBeCloseTo(425.50, 2);
    expect(empresaA!.igv).toBeCloseTo(76.59, 2);
    expect(empresaA!.total).toBeCloseTo(502.09, 2);

    // EMPRESA B: 300.00
    const empresaB = result.companies.find(c => c.company === 'EMPRESA B');
    expect(empresaB).toBeDefined();
    expect(empresaB!.rows).toHaveLength(1);
    expect(empresaB!.subtotal).toBeCloseTo(300.00, 2);
    expect(empresaB!.igv).toBeCloseTo(54.00, 2);
    expect(empresaB!.total).toBeCloseTo(354.00, 2);
  });

  it('should map all required output fields correctly', () => {
    const result = parseValoracionesCsvContent(SAMPLE_CSV);
    const empresaA = result.companies.find(c => c.company === 'EMPRESA A')!;
    const row = empresaA.rows[0];

    expect(row.facturar_a).toBe('EMPRESA A');
    expect(row.contratades).toBe('CONTRAT A');
    expect(row.proyectodes).toBe('PROYECTO A');
    expect(row.cr_proy).toBe('CR A');
    expect(row.dociden).toBe('DNI 12345678');
    expect(row.nombre).toBe('JUAN PEREZ');
    expect(row.edad).toBe('30');
    expect(row['Fecha de Nacimiento']).toBe('15/05/1995');
    expect(row.ocupacion).toBe('INGENIERO');
    expect(row.tipotrab).toBe('EMPLEADO');
    expect(row.feorden).toBe('01/01/2026');
    expect(row.tipo_examen).toBe('PREOCUPACIONAL');
    expect(row.perfil).toBe('PERFIL A');
    expect(row.solicitado).toBe('SOLICITANTE A');
    expect(row.costo).toBe(150.00);
    // Internal tracking fields should NOT be present
    expect((row as unknown as Record<string, unknown>).resultado).toBeUndefined();
    expect((row as unknown as Record<string, unknown>).anexo7d).toBeUndefined();
  });

  it('should handle empty CSV data', () => {
    const emptyCsv = 'facturar a,total\n';
    const result = parseValoracionesCsvContent(emptyCsv);
    expect(result.companies).toHaveLength(0);
  });

  it('should include zero-cost rows and group them by company', () => {
    const allZeroCsv = `facturar a,total
EMPRESA X,0.00
EMPRESA X,0
EMPRESA Y,`;
    const result = parseValoracionesCsvContent(allZeroCsv);
    // Row with empty total is filtered out; 0.00 and 0 are kept
    expect(result.companies).toHaveLength(1);
    const empresaX = result.companies[0];
    expect(empresaX.company).toBe('EMPRESA X');
    expect(empresaX.rows).toHaveLength(2);
    expect(empresaX.subtotal).toBe(0);
    expect(empresaX.igv).toBe(0);
    expect(empresaX.total).toBe(0);
  });

  it('should handle special characters in company names', () => {
    const csvWithSpecial = `facturar a,total
EMPRESA S.A.C. (SUCURSAL),100.00
EMPRESA S.A.C. (SUCURSAL),50.00`;
    const result = parseValoracionesCsvContent(csvWithSpecial);
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].company).toBe('EMPRESA S.A.C. (SUCURSAL)');
    expect(result.companies[0].rows).toHaveLength(2);
    expect(result.companies[0].subtotal).toBeCloseTo(150.00, 2);
  });

  it('should handle a single row of data', () => {
    const singleRowCsv = `facturar a,total
UNICA EMPRESA,500.00`;
    const result = parseValoracionesCsvContent(singleRowCsv);
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0].company).toBe('UNICA EMPRESA');
    expect(result.companies[0].rows).toHaveLength(1);
    expect(result.companies[0].subtotal).toBe(500.00);
    expect(result.companies[0].total).toBe(590.00);
  });
});

// ---- Tests for generateValoracionesWorkbook ----

describe('generateValoracionesWorkbook', () => {
  const mockGroupedData: GroupedData = {
    companies: [
      {
        company: 'EMPRESA A',
        rows: [
          {
            facturar_a: 'EMPRESA A',
            contratades: 'CONTRAT A',
            proyectodes: 'PROYECTO A',
            cr_proy: 'CR A',
            dociden: 'DNI 12345678',
            nombre: 'JUAN PEREZ',
            edad: 30,
            'Fecha de Nacimiento': '15/05/1995',
            ocupacion: 'INGENIERO',
            tipotrab: 'EMPLEADO',
            feorden: '01/01/2026',
            tipo_examen: 'PREOCUPACIONAL',
            perfil: 'PERFIL A',
            solicitado: 'SOLICITANTE A',
            costo: 150.00,
          },
          {
            facturar_a: 'EMPRESA A',
            contratades: 'CONTRAT A',
            proyectodes: 'PROYECTO A',
            cr_proy: 'CR A',
            dociden: 'DNI 87654321',
            nombre: 'MARIA GARCIA',
            edad: 25,
            'Fecha de Nacimiento': '10/03/2000',
            ocupacion: 'CONTADORA',
            tipotrab: 'EMPLEADO',
            feorden: '02/01/2026',
            tipo_examen: 'RX COLUMNA',
            perfil: 'PERFIL B',
            solicitado: 'SOLICITANTE B',
            costo: 75.50,
          },
        ],
        subtotal: 225.50,
        igv: 40.59,
        total: 266.09,
      },
    ],
  };

  it('should generate a valid Excel buffer with correct structure', () => {
    const buffer = generateValoracionesWorkbook(mockGroupedData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    // Read back and verify structure
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toHaveLength(1);
    expect(workbook.SheetNames[0]).toBe('EMPRESA A');

    const sheet = workbook.Sheets['EMPRESA A'];
    const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(sheet, { header: 1, defval: '' });

    // Row 0 should contain the company name
    expect(rows[0][0]).toBe('EMPRESA A');

    // Row 1: column headers
    expect(rows[1][0]).toBe('Item');
    expect(rows[1][1]).toBe('Nombre');
    expect(rows[1][2]).toBe('Documento');
    expect(rows[1][3]).toBe('Examen');
    expect(rows[1][4]).toBe('Perfil');
    expect(rows[1][5]).toBe('Costo (S/.)');

    // Row 2: first data row
    expect(rows[2][0]).toBe(1);
    expect(rows[2][1]).toBe('JUAN PEREZ');
    expect(rows[2][2]).toBe('DNI 12345678');
    expect(rows[2][3]).toBe('PREOCUPACIONAL');
    expect(rows[2][4]).toBe('PERFIL A');
    expect(rows[2][5]).toBe(150.00);

    // Row 3: second data row
    expect(rows[3][0]).toBe(2);
    expect(rows[3][1]).toBe('MARIA GARCIA');
    expect(rows[3][2]).toBe('DNI 87654321');
    expect(rows[3][3]).toBe('RX COLUMNA');
    expect(rows[3][4]).toBe('PERFIL B');
    expect(rows[3][5]).toBe(75.50);

    // After data rows, there should be an empty row, then summary rows
    const lastRows = rows.slice(-4);
    // Find summary rows by checking the first column text
    const summaryTexts = lastRows.map((r: unknown[]) => String(r[0] || ''));
    expect(summaryTexts).toContain('Subtotal');
    expect(summaryTexts).toContain('IGV 18%');
    expect(summaryTexts).toContain('Total');
  });

  it('should generate multiple sheets for multiple companies', () => {
    const multiCompanyData: GroupedData = {
      companies: [
        {
          company: 'EMPRESA A',
          rows: [{
            facturar_a: 'EMPRESA A', contratades: '', proyectodes: '', cr_proy: '',
            dociden: 'DNI 1', nombre: 'A', edad: '', 'Fecha de Nacimiento': '',
            ocupacion: '', tipotrab: '', feorden: '', tipo_examen: 'EXAM A',
            perfil: '', solicitado: '', costo: 100,
          }],
          subtotal: 100, igv: 18, total: 118,
        },
        {
          company: 'EMPRESA B',
          rows: [{
            facturar_a: 'EMPRESA B', contratades: '', proyectodes: '', cr_proy: '',
            dociden: 'DNI 2', nombre: 'B', edad: '', 'Fecha de Nacimiento': '',
            ocupacion: '', tipotrab: '', feorden: '', tipo_examen: 'EXAM B',
            perfil: '', solicitado: '', costo: 200,
          }],
          subtotal: 200, igv: 36, total: 236,
        },
      ],
    };

    const buffer = generateValoracionesWorkbook(multiCompanyData);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames).toHaveLength(2);
    expect(workbook.SheetNames[0]).toBe('EMPRESA A');
    expect(workbook.SheetNames[1]).toBe('EMPRESA B');
  });

  it('should handle empty grouped data gracefully', () => {
    const emptyData: GroupedData = { companies: [] };
    const buffer = generateValoracionesWorkbook(emptyData);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    // A placeholder sheet named 'Empty' is created for empty data to avoid xlsx error
    expect(workbook.SheetNames).toHaveLength(1);
    expect(workbook.SheetNames[0]).toBe('Empty');
  });

  it('should truncate company names to 31 characters for sheet names', () => {
    const longName = 'EMPRESA CON NOMBRE MUY LARGO QUE EXCEDE TREINTA Y UN CARACTERES';
    const data: GroupedData = {
      companies: [{
        company: longName,
        rows: [{
          facturar_a: longName, contratades: '', proyectodes: '', cr_proy: '',
          dociden: 'DNI 1', nombre: 'A', edad: '', 'Fecha de Nacimiento': '',
          ocupacion: '', tipotrab: '', feorden: '', tipo_examen: 'EXAM',
          perfil: '', solicitado: '', costo: 100,
        }],
        subtotal: 100, igv: 18, total: 118,
      }],
    };

    const buffer = generateValoracionesWorkbook(data);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
    // The sheet name should be the first 31 chars of the company name
    expect(workbook.SheetNames[0]).toBe(longName.substring(0, 31));
  });
});
