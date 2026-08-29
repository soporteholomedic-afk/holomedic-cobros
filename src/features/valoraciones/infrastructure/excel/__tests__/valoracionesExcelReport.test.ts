import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

import { makeRepFacturacion } from '../../../domain/fixtures';
import {
  generarValoracionesExcelBuffer,
  type ValoracionesExcelInput,
} from '../valoracionesExcelReport';

/** Default DTO covering the happy path: SOLES, cliente with RUC, one row. */
function makeInput(overrides: Partial<ValoracionesExcelInput> = {}): ValoracionesExcelInput {
  return {
    membrete: { nombre: 'HOLOMEDIC SERVICIOS INTEGRALES S.A.C.', ruc: '20556200328' },
    cliente: { nombre: 'CLIENTE DEMO S.A.C.', ruc: '20100047218' },
    fecIni: '2026-03-01',
    fecFin: '2026-03-31',
    moneda: { codMon: 1, descripcion: 'SOLES', simbol: 's/.' },
    fechaEmision: '29/08/2026',
    logo: null,
    rows: [makeRepFacturacion()],
    ...overrides,
  };
}

async function leerAoa(input: ValoracionesExcelInput): Promise<unknown[][]> {
  const buffer = await generarValoracionesExcelBuffer(input);
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  expect(wb.SheetNames).toEqual(['VALORACIONES']);
  const sheet = wb.Sheets['VALORACIONES'];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    // Absolute layout: blank rows (e.g. spacer row 6) must keep their index.
    blankrows: true,
  });
  // sheet_to_json returns rows relative to `!ref`'s first row; re-anchor to
  // ABSOLUTE sheet rows so assertions can use the fixed layout indices.
  const firstRow = XLSX.utils.decode_range(sheet['!ref'] as string).s.r;
  const absolute: unknown[][] = [];
  aoa.forEach((row, i) => {
    absolute[i + firstRow] = row;
  });
  return absolute;
}

/** ExcelJS round-trip reader — for numFmt/style/merge/view assertions. */
async function leerHojaExcelJs(input: ValoracionesExcelInput): Promise<ExcelJS.Worksheet> {
  const buffer = await generarValoracionesExcelBuffer(input);
  const wb = new ExcelJS.Workbook();
  // exceljs's load() types expect its own Buffer interface — narrow cast.
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = wb.getWorksheet('VALORACIONES');
  if (!sheet) throw new Error('VALORACIONES sheet missing after round-trip');
  return sheet;
}

describe('generarValoracionesExcelWorkbook — column contract', () => {
  it('names the sheet VALORACIONES with exactly 15 columns in order (R2, R4)', async () => {
    const aoa = await leerAoa(makeInput());
    expect(aoa[6]).toEqual([
      'facturar a',
      'contratades',
      'proyectodes',
      'cr_proy',
      'dociden',
      'nombre',
      'edad',
      'Fecha de Nacimiento',
      'ocupacion',
      'tipotrab',
      'feorden',
      'tipo_examen',
      'perfil',
      'solicitado',
      'Costo (S/)',
    ]);
  });

  it('labels the costo column "Costo ($)" for DOLARES (codMon 2)', async () => {
    const aoa = await leerAoa(makeInput({ moneda: { codMon: 2, descripcion: 'DOLARES', simbol: '$' } }));
    const header = aoa[6] as unknown[];
    expect(header[14]).toBe('Costo ($)');
  });
});

describe('generarValoracionesExcelWorkbook — header block (R1)', () => {
  it('renders membrete name + RUC 20556200328, período, moneda and fecha de emisión', async () => {
    const aoa = await leerAoa(makeInput());
    expect(aoa[0][3]).toBe('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(aoa[1][3]).toBe('RUC: 20556200328');
    expect(aoa[2][3]).toBe('Período: 01/03/2026 – 31/03/2026');
    expect(aoa[3][3]).toBe('Moneda: SOLES (s/.)');
    expect(aoa[4][3]).toBe('Fecha de emisión: 29/08/2026');
  });

  it('renders the período in dd/MM/yyyy even with datetime ISO bounds', async () => {
    const aoa = await leerAoa(
      makeInput({ fecIni: '2026-03-01T00:00:00.000Z', fecFin: '2026-03-31T23:59:59.000Z' }),
    );
    expect(aoa[2][3]).toBe('Período: 01/03/2026 – 31/03/2026');
  });

  it('renders the client name + RUC when the resolver found both', async () => {
    const aoa = await leerAoa(makeInput());
    expect(aoa[0][9]).toBe('CLIENTE DEMO S.A.C.');
    expect(aoa[1][9]).toBe('RUC: 20100047218');
  });

  it('omits BOTH client rows when cliente is null (global export fallback)', async () => {
    const aoa = await leerAoa(makeInput({ cliente: null }));
    expect(aoa[0][9]).toBe('');
    expect(aoa[1][9]).toBe('');
  });

  it('keeps the client name but omits the RUC row when the RUC is unknown', async () => {
    const aoa = await leerAoa(makeInput({ cliente: { nombre: 'CLIENTE SIN RUC', ruc: '' } }));
    expect(aoa[0][9]).toBe('CLIENTE SIN RUC');
    expect(aoa[1][9]).toBe('');
  });

  it('renders the membrete name bold', async () => {
    const sheet = await leerHojaExcelJs(makeInput());
    expect(sheet.getCell('D1').font?.bold).toBe(true);
  });
});

describe('generarValoracionesExcelWorkbook — flat data rows (R2)', () => {
  it('emits one row per ItemEx: 3 items sharing IdAten → 3 data rows', async () => {
    const rows = [
      makeRepFacturacion({ IdAten: '000123', ItemEx: 1, Pacien: 'PACIENTE UNO' }),
      makeRepFacturacion({ IdAten: '000123', ItemEx: 2, Pacien: 'PACIENTE DOS' }),
      makeRepFacturacion({ IdAten: '000123', ItemEx: 3, Pacien: 'PACIENTE TRES' }),
    ];
    const aoa = await leerAoa(makeInput({ rows }));
    expect(aoa[7][5]).toBe('PACIENTE UNO');
    expect(aoa[8][5]).toBe('PACIENTE DOS');
    expect(aoa[9][5]).toBe('PACIENTE TRES');
    expect(aoa[10][5]).toBe(''); // row 11 is the totals block — no 4th patient
  });

  it('maps a RepFacturacion row to the 15 columns with facturar a via nombreEmpresa', async () => {
    const row = makeRepFacturacion({
      NomCFa: '', // blank facturar-a → nombreEmpresa falls back to NomCli
      NomCli: 'CLIENTE PARTICULAR',
      Pacien: 'PACIENTE UNO',
      VVtaMN: 100,
    });
    const aoa = await leerAoa(makeInput({ rows: [row] }));
    expect(aoa[7]).toEqual([
      'CLIENTE PARTICULAR', // facturar a — nombreEmpresa fallback
      'EMPRESA DEMO S.A.C.', // contratades = NomCom
      'OFICINA PRINCIPAL', // proyectodes = DesDes
      'CC-001', // cr_proy = CenCos
      'DNI 46145583', // dociden = NroDId
      'PACIENTE UNO', // nombre = Pacien
      34, // edad = EdaPac (numeric)
      expect.anything(), // Fecha de Nacimiento (date cell — cycle below)
      'ANALISTA', // ocupacion = DesPue
      'EMPLEADO', // tipotrab = DsTiTr
      expect.anything(), // feorden = FecAte (date cell — cycle below)
      'PREOCUPACIONAL', // tipo_examen = DesTCh
      'PROYECTO DEMO', // perfil = NomPro
      'SOLICITANTE DEMO', // solicitado = Solici
      100, // costo = round2(ventaPorMoneda)
    ]);
  });

  it('writes costo as numeric round2(ventaPorMoneda) with numFmt #,##0.00', async () => {
    const row = makeRepFacturacion({ VVtaMN: 100.129 });
    const aoa = await leerAoa(makeInput({ rows: [row] }));
    expect(aoa[7][14]).toBe(100.13);

    const sheet = await leerHojaExcelJs(makeInput({ rows: [row] }));
    const cell = sheet.getCell('O8');
    expect(cell.value).toBe(100.13);
    expect(cell.numFmt).toBe('#,##0.00');
  });

  it('takes the costo from VVtaMO when codMon is 2', async () => {
    const aoa = await leerAoa(
      makeInput({
        moneda: { codMon: 2, descripcion: 'DOLARES', simbol: '$' },
        rows: [makeRepFacturacion({ VVtaMN: 100, VVtaMO: 42.5 })],
      }),
    );
    expect(aoa[7][14]).toBe(42.5);
  });
});

describe('generarValoracionesExcelWorkbook — date cells (R2)', () => {
  it('writes UTC-anchored real date cells with dd/mm/yyyy numFmt (no day-shift)', async () => {
    const row = makeRepFacturacion({ FecAte: '2026-03-05T00:00:00.000Z', FecNac: '1992-03-14' });
    const sheet = await leerHojaExcelJs(makeInput({ rows: [row] }));

    const feorden = sheet.getCell('K8');
    expect(feorden.value).toBeInstanceOf(Date);
    const fechaOrden = feorden.value as Date;
    expect(fechaOrden.getUTCFullYear()).toBe(2026);
    expect(fechaOrden.getUTCMonth()).toBe(2); // March — zero-based
    expect(fechaOrden.getUTCDate()).toBe(5);
    expect(feorden.numFmt).toBe('dd/mm/yyyy');

    const nacimiento = sheet.getCell('H8');
    expect(nacimiento.value).toBeInstanceOf(Date);
    const fechaNac = nacimiento.value as Date;
    expect(fechaNac.getUTCFullYear()).toBe(1992);
    expect(fechaNac.getUTCMonth()).toBe(2);
    expect(fechaNac.getUTCDate()).toBe(14);
    expect(nacimiento.numFmt).toBe('dd/mm/yyyy');
  });

  it('renders a NULL Fecha de Nacimiento as an empty cell (no placeholder)', async () => {
    const row = makeRepFacturacion({ FecNac: null });
    const aoa = await leerAoa(makeInput({ rows: [row] }));
    expect(aoa[7][7]).toBe('');
    const sheet = await leerHojaExcelJs(makeInput({ rows: [row] }));
    expect(sheet.getCell('H8').value).toBeNull();
  });
});

describe('generarValoracionesExcelWorkbook — grand totals block (R3)', () => {
  it('ends the sheet with SubTotal 142.50, IGV 18% 25.65, Total 168.15', async () => {
    const rows = [
      makeRepFacturacion({ VVtaMN: 100, VVtaMO: 0 }),
      makeRepFacturacion({ VVtaMN: 42.5, VVtaMO: 0 }),
    ];
    const aoa = await leerAoa(makeInput({ rows }));
    // Last data row = 9 → totals block at rows 10..12 (label M merged, value O).
    expect(aoa[9][12]).toBe('SubTotal');
    expect(aoa[9][14]).toBe(142.5);
    expect(aoa[10][12]).toBe('IGV 18%');
    expect(aoa[10][14]).toBe(25.65);
    expect(aoa[11][12]).toBe('Total');
    expect(aoa[11][14]).toBe(168.15);
  });

  it('sums via ventaPorMoneda for DOLARES (codMon 2) as well', async () => {
    const rows = [
      makeRepFacturacion({ VVtaMN: 100, VVtaMO: 30 }),
      makeRepFacturacion({ VVtaMN: 42.5, VVtaMO: 10 }),
    ];
    const aoa = await leerAoa(
      makeInput({ moneda: { codMon: 2, descripcion: 'DOLARES', simbol: '$' }, rows }),
    );
    expect(aoa[9][14]).toBe(40); // 30 + 10
    expect(aoa[10][14]).toBe(7.2); // 18% of 40
    expect(aoa[11][14]).toBe(47.2);
  });

  it('keeps the list flat: exactly ONE totals block for mixed empresas', async () => {
    const rows = [
      makeRepFacturacion({ NomCFa: 'EMPRESA A' }),
      makeRepFacturacion({ NomCFa: 'EMPRESA B' }),
      makeRepFacturacion({ NomCFa: 'EMPRESA A' }),
    ];
    const aoa = await leerAoa(makeInput({ rows }));
    const labels = ['SubTotal', 'IGV 18%', 'Total'];
    const ocurrencias = labels.map((label) =>
      aoa.reduce((n, fila) => (Array.isArray(fila) && fila.includes(label) ? n + 1 : n), 0),
    );
    expect(ocurrencias).toEqual([1, 1, 1]);
  });

  it('emphasizes the Total row (bold label + value)', async () => {
    const rows = [makeRepFacturacion({ VVtaMN: 100 })];
    const sheet = await leerHojaExcelJs(makeInput({ rows }));
    // 1 data row → totals at rows 9..11: SubTotal 9, IGV 10, Total 11.
    expect(sheet.getCell('M9').value).toBe('SubTotal');
    expect(sheet.getCell('M11').value).toBe('Total');
    expect(sheet.getCell('M11').font?.bold).toBe(true);
    expect(sheet.getCell('O11').font?.bold).toBe(true);
    expect(sheet.getCell('O11').value).toBe(118); // 100 + 18 IGV
  });
});

describe('generarValoracionesExcelWorkbook — usability & print layout (R4)', () => {
  it('freezes the header row (ySplit 7)', async () => {
    const sheet = await leerHojaExcelJs(makeInput());
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 7 });
  });

  it('sets autofilter over the data columns only (A7:O9 for 2 rows — totals excluded)', async () => {
    const rows = [makeRepFacturacion(), makeRepFacturacion()];
    const buffer = await generarValoracionesExcelBuffer(makeInput({ rows }));
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets['VALORACIONES'];
    // SheetJS reports the autofilter as a ref string: A7 → last DATA row (O9
    // for 2 rows) — totals rows are excluded.
    expect(ws['!autofilter']).toEqual({ ref: 'A7:O9' });
  });

  it('configures A4 landscape fit-to-width with the header repeated on every page', async () => {
    const sheet = await leerHojaExcelJs(makeInput());
    expect(sheet.pageSetup).toMatchObject({
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '7:7',
    });
  });

  it('skips the image without failing when the logo asset is missing (null)', async () => {
    const sheet = await leerHojaExcelJs(makeInput({ logo: null }));
    expect(sheet.getImages()).toHaveLength(0);
  });

  it('embeds the committed logo once when PNG bytes are provided', async () => {
    const logo = readFileSync(resolve(process.cwd(), 'public/logo-holomedic.png'));
    const sheet = await leerHojaExcelJs(makeInput({ logo }));
    expect(sheet.getImages()).toHaveLength(1);
  });

  it('styles the header row bold with the FFD9E1F2 fill', async () => {
    const sheet = await leerHojaExcelJs(makeInput());
    const cell = sheet.getCell('A7');
    expect(cell.font?.bold).toBe(true);
    expect(cell.fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } });
  });

  it('applies the designed column widths', async () => {
    const sheet = await leerHojaExcelJs(makeInput());
    expect(sheet.getColumn(1).width).toBe(24); // facturar a
    expect(sheet.getColumn(6).width).toBe(30); // nombre
    expect(sheet.getColumn(12).width).toBe(22); // tipo_examen
    expect(sheet.getColumn(15).width).toBe(12); // costo
  });

  it('configures row heights, vertical alignments, borders and zebra striping', async () => {
    const rows = [makeRepFacturacion(), makeRepFacturacion()];
    const sheet = await leerHojaExcelJs(makeInput({ rows }));

    // Header row height & alignment
    expect(sheet.getRow(7).height).toBe(26);
    expect(sheet.getCell('A7').alignment?.vertical).toBe('middle');
    expect(sheet.getCell('O7').alignment?.horizontal).toBe('right');

    // Data rows height & alignments
    expect(sheet.getRow(8).height).toBe(20);
    expect(sheet.getRow(9).height).toBe(20);

    // Row 8 (first row) -> no zebra fill
    const fillA8 = sheet.getCell('A8').fill;
    if (fillA8 && fillA8.type === 'pattern') {
      expect(fillA8.pattern).toBe('none');
    }
    expect(sheet.getCell('A8').border?.top?.style).toBe('thin');
    expect(sheet.getCell('E8').alignment?.horizontal).toBe('center'); // dociden
    expect(sheet.getCell('H8').alignment?.horizontal).toBe('center'); // FecNac
    expect(sheet.getCell('O8').alignment?.horizontal).toBe('right'); // costo

    // Row 9 (even row in 0-indexed list) -> zebra fill
    expect(sheet.getCell('A9').fill).toMatchObject({
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    });

    // Accounting totals double border on Total row
    const totalRow = sheet.getRow(12);
    expect(totalRow.height).toBe(22);
    expect(sheet.getCell('M12').border?.bottom?.style).toBe('double');
    expect(sheet.getCell('O12').border?.bottom?.style).toBe('double');
  });
});

