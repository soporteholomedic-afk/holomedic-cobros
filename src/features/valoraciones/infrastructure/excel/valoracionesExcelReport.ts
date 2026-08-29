import ExcelJS from 'exceljs';

import { nombreEmpresa, round2, totalesDe, ventaPorMoneda } from '../../domain/agrupacion';
import type { CodigoMoneda, RepFacturacion } from '../../domain/entities';
import type { Membrete } from '../clientHeaderResolver';

/**
 * Client-facing valoraciones Excel report (change: flat list with one
 * grand-total block at the end). Replaces the legacy 30-column Formato 35
 * with an exceljs workbook: membreted header block, flat one-row-per-ItemEx
 * data list (15 columns) and a 3-row SubTotal / IGV 18% / Total block.
 *
 * PURE builder — imports domain functions and types only (plus exceljs);
 * no repository, no fs, no clock: the caller supplies logo bytes, the
 * client header and the emission date via `ValoracionesExcelInput`. The
 * async wrapper `generarValoracionesExcelBuffer` is the only impure step
 * (serialization).
 */

/** Header-context input port of the builder (design §2). */
export interface ValoracionesExcelInput {
  /** Institutional membrete (name + RUC 20556200328). */
  membrete: Membrete;
  /** Client header; `null` omits the client rows (D3 — omit, never fake). */
  cliente: { nombre: string; ruc: string } | null;
  /** ISO period bounds; rendered `dd/MM/yyyy` in the header block. */
  fecIni: string;
  fecFin: string;
  /** `MONEDAS[codMon]`; `codMon` also drives `ventaPorMoneda` and labels. */
  moneda: { codMon: CodigoMoneda; descripcion: string; simbol: string };
  /** Emission date, pre-formatted `dd/MM/yyyy`. */
  fechaEmision: string;
  /** PNG logo bytes; `null` skips the image without failing the export. */
  logo: Buffer | null;
  /** Flat data rows — one element per ItemEx. */
  rows: readonly RepFacturacion[];
}

/** The sheet's single worksheet name (spec R4). */
export const NOMBRE_HOJA = 'VALORACIONES';

/** Fixed part of the row-7 header (column order is an exact contract). */
const COLUMNAS_FIJAS = [
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
] as const;

/** Verbatim costo labels per moneda (reference-file contract, spec R2). */
export function etiquetaCosto(codMon: CodigoMoneda): string {
  return codMon === 2 ? 'Costo ($)' : 'Costo (S/)';
}

/** `YYYY-MM-DD` (or ISO datetime) → `dd/MM/yyyy` (domain display contract). */
function fechaDisplay(iso: string): string {
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Excel numFmt for real date cells (display contract `dd/MM/yyyy`). */
const FORMATO_FECHA = 'dd/mm/yyyy';

/** Column text alignment mapping by column 1-indexed number. */
const ALINEACION_COLUMNAS: Record<number, 'left' | 'center' | 'right'> = {
  1: 'left', // facturar a
  2: 'left', // contratades
  3: 'left', // proyectodes
  4: 'center', // cr_proy
  5: 'center', // dociden
  6: 'left', // nombre
  7: 'center', // edad
  8: 'center', // Fecha de Nacimiento
  9: 'left', // ocupacion
  10: 'left', // tipotrab
  11: 'center', // feorden
  12: 'left', // tipo_examen
  13: 'left', // perfil
  14: 'left', // solicitado
  15: 'right', // costo
};

const BORDE_DELGADO: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

const RELLENO_CEBRA: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' },
};

/**
 * ISO `YYYY-MM-DD`[T…] → UTC-anchored `Date`. Anchoring at UTC midnight
 * keeps the rendered day stable regardless of the host timezone (a
 * `new Date('2026-03-05')` local parse would shift the day for TZ < UTC).
 */
function fechaUtc(iso: string): Date {
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/**
 * Rows 1–5 header block (design §3). Indices are fixed regardless of
 * degradation: A1:C2 stays reserved for the logo, the membrete block
 * lives in D:H and the client block in J:O. Unknown values are omitted
 * — never replaced with placeholders (D3).
 */
function escribirBloqueCabecera(
  sheet: ExcelJS.Worksheet,
  input: ValoracionesExcelInput,
): void {
  sheet.mergeCells('A1:C2'); // reserved empty zone for the logo image

  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 18;
  sheet.getRow(5).height = 18;

  const titleFont: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF1E293B' },
  };
  const labelFont: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 10,
    color: { argb: 'FF475569' },
  };

  const nombreCell = sheet.getCell('D1');
  nombreCell.value = input.membrete.nombre;
  nombreCell.font = titleFont;
  nombreCell.alignment = { vertical: 'middle' };
  sheet.mergeCells('D1:H1');

  const rucCell = sheet.getCell('D2');
  rucCell.value = `RUC: ${input.membrete.ruc}`;
  rucCell.font = labelFont;
  rucCell.alignment = { vertical: 'middle' };
  sheet.mergeCells('D2:H2');

  if (input.cliente) {
    const clienteCell = sheet.getCell('J1');
    clienteCell.value = input.cliente.nombre;
    clienteCell.font = titleFont;
    clienteCell.alignment = { vertical: 'middle' };
    sheet.mergeCells('J1:O1');

    if (input.cliente.ruc !== '') {
      const clienteRucCell = sheet.getCell('J2');
      clienteRucCell.value = `RUC: ${input.cliente.ruc}`;
      clienteRucCell.font = labelFont;
      clienteRucCell.alignment = { vertical: 'middle' };
      sheet.mergeCells('J2:O2');
    }
  }

  const periodoCell = sheet.getCell('D3');
  periodoCell.value = `Período: ${fechaDisplay(input.fecIni)} – ${fechaDisplay(input.fecFin)}`;
  periodoCell.font = labelFont;
  periodoCell.alignment = { vertical: 'middle' };
  sheet.mergeCells('D3:H3');

  const monedaCell = sheet.getCell('D4');
  monedaCell.value = `Moneda: ${input.moneda.descripcion} (${input.moneda.simbol})`;
  monedaCell.font = labelFont;
  monedaCell.alignment = { vertical: 'middle' };
  sheet.mergeCells('D4:H4');

  const emisionCell = sheet.getCell('D5');
  emisionCell.value = `Fecha de emisión: ${input.fechaEmision}`;
  emisionCell.font = labelFont;
  emisionCell.alignment = { vertical: 'middle' };
  sheet.mergeCells('D5:H5');
}

/** Column widths (design §3): wide key columns, costo compact. */
const ANCHOS: Array<[number, number]> = [
  [1, 24], // facturar a
  [2, 16], // contratades
  [3, 16], // proyectodes
  [4, 10], // cr_proy
  [5, 16], // dociden
  [6, 30], // nombre
  [7, 8], // edad
  [8, 14], // Fecha de Nacimiento
  [9, 16], // ocupacion
  [10, 14], // tipotrab
  [11, 12], // feorden
  [12, 22], // tipo_examen
  [13, 18], // perfil
  [14, 18], // solicitado
  [15, 12], // costo
];

/**
 * Flat data region (rows 8..7+n, design §3): exactly one row per ItemEx —
 * no group subtotals anywhere. Column order mirrors the row-7 header.
 */
function escribirFilasDatos(
  sheet: ExcelJS.Worksheet,
  input: ValoracionesExcelInput,
): void {
  const dataFont: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 10,
    color: { argb: 'FF1E293B' },
  };

  input.rows.forEach((row, index) => {
    const dataRow = sheet.getRow(8 + index);
    dataRow.height = 20;
    const isEven = index % 2 === 1;

    const valores: Array<string | number | null> = [
      nombreEmpresa(row), // 1  facturar a
      row.NomCom, // 2  contratades
      row.DesDes, // 3  proyectodes
      row.CenCos, // 4  cr_proy
      row.NroDId, // 5  dociden
      row.Pacien, // 6  nombre
      row.EdaPac, // 7  edad
      null, // 8  Fecha de Nacimiento — real date cell (see fechas)
      row.DesPue, // 9  ocupacion
      row.DsTiTr, // 10 tipotrab
      null, // 11 feorden = FecAte — real date cell (see fechas)
      row.DesTCh, // 12 tipo_examen
      row.NomPro, // 13 perfil
      row.Solici, // 14 solicitado
    ];

    valores.forEach((valor, colIdx) => {
      const colNum = colIdx + 1;
      const cell = dataRow.getCell(colNum);
      if (valor !== null) {
        cell.value = valor;
      }
      cell.font = dataFont;
      cell.alignment = {
        vertical: 'middle',
        horizontal: ALINEACION_COLUMNAS[colNum] ?? 'left',
      };
      cell.border = BORDE_DELGADO;
      if (isEven) {
        cell.fill = RELLENO_CEBRA;
      }
    });

    // Real date cells, UTC-anchored (no TZ day-shift); NULL → empty.
    const fechaNacCell = dataRow.getCell(8);
    if (row.FecNac) {
      fechaNacCell.value = fechaUtc(row.FecNac);
      fechaNacCell.numFmt = FORMATO_FECHA;
    }
    fechaNacCell.font = dataFont;
    fechaNacCell.alignment = { vertical: 'middle', horizontal: 'center' };
    fechaNacCell.border = BORDE_DELGADO;
    if (isEven) fechaNacCell.fill = RELLENO_CEBRA;

    const feordenCell = dataRow.getCell(11);
    feordenCell.value = fechaUtc(row.FecAte);
    feordenCell.numFmt = FORMATO_FECHA;
    feordenCell.font = dataFont;
    feordenCell.alignment = { vertical: 'middle', horizontal: 'center' };
    feordenCell.border = BORDE_DELGADO;
    if (isEven) feordenCell.fill = RELLENO_CEBRA;

    const costoCell = dataRow.getCell(15);
    costoCell.value = round2(ventaPorMoneda(row, input.moneda.codMon));
    costoCell.numFmt = '#,##0.00';
    costoCell.font = dataFont;
    costoCell.alignment = { vertical: 'middle', horizontal: 'right' };
    costoCell.border = BORDE_DELGADO;
    if (isEven) costoCell.fill = RELLENO_CEBRA;
  });
}

/**
 * Grand totals block (rows r+1..r+3 after the last data row, design §3):
 * label merged across M:N right-aligned, numeric value in O. Semantics
 * come verbatim from domain `totalesDe` (round2 everywhere, IGV 18%) —
 * the flat list has NO other subtotals.
 */
function escribirBloqueTotales(
  sheet: ExcelJS.Worksheet,
  input: ValoracionesExcelInput,
): void {
  const totals = totalesDe([...input.rows], input.moneda.codMon);
  const firstTotalsRow = 7 + input.rows.length + 1;
  const filas: Array<{ label: string; value: number; bold: boolean }> = [
    { label: 'SubTotal', value: totals.subtotal, bold: false },
    { label: 'IGV 18%', value: totals.igv, bold: false },
    { label: 'Total', value: totals.total, bold: true },
  ];

  filas.forEach((fila, index) => {
    const rowNum = firstTotalsRow + index;
    const row = sheet.getRow(rowNum);
    row.height = 22;

    const font: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 10,
      bold: fila.bold,
      color: { argb: fila.bold ? 'FF0F172A' : 'FF334155' },
    };

    const totalsFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fila.bold ? 'FFE2E8F0' : 'FFF8FAFC' },
    };

    const border: Partial<ExcelJS.Borders> = fila.bold
      ? {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF475569' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        }
      : {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

    [13, 14, 15].forEach((col) => {
      const cell = row.getCell(col);
      cell.fill = totalsFill;
      cell.border = border;
    });

    const labelCell = row.getCell(13); // M
    labelCell.value = fila.label;
    sheet.mergeCells(rowNum, 13, rowNum, 14);
    labelCell.font = font;
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };

    const valueCell = row.getCell(15); // O
    valueCell.value = fila.value;
    valueCell.numFmt = '#,##0.00';
    valueCell.font = font;
    valueCell.alignment = { vertical: 'middle', horizontal: 'right' };
  });
}

/** Build the pure workbook (no IO). Rows are one cell-block per ItemEx. */
export function generarValoracionesExcelWorkbook(
  input: ValoracionesExcelInput,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(NOMBRE_HOJA);

  escribirBloqueCabecera(sheet, input);

  // Row 7 — the 15-column contract header (bold + light-blue fill).
  const headerRow = sheet.getRow(7);
  headerRow.height = 26;

  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFB0C4DE' } },
    bottom: { style: 'medium', color: { argb: 'FF8FAADC' } },
    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  };

  const headerStyle = {
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
    border: headerBorder,
  } as const;

  COLUMNAS_FIJAS.forEach((label, index) => {
    const colNum = index + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = label;
    cell.style = headerStyle;
    cell.alignment = {
      vertical: 'middle',
      horizontal: ALINEACION_COLUMNAS[colNum] ?? 'left',
    };
  });
  const costoCell = headerRow.getCell(15);
  costoCell.value = etiquetaCosto(input.moneda.codMon);
  costoCell.style = headerStyle;
  costoCell.alignment = {
    vertical: 'middle',
    horizontal: 'right',
  };

  ANCHOS.forEach(([columna, ancho]) => {
    sheet.getColumn(columna).width = ancho;
  });

  escribirFilasDatos(sheet, input);
  escribirBloqueTotales(sheet, input);

  // Sheet usability & print layout (spec R4): frozen header, autofilter
  // over the data region ONLY (totals excluded), A4 landscape fit-to-width
  // with the header row repeated on every printed page.
  sheet.views = [{ state: 'frozen', ySplit: 7, showGridLines: true }];
  const lastDataRow = 7 + input.rows.length;
  sheet.autoFilter = { from: 'A7', to: `O${lastDataRow}` };
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '7:7',
  };

  // Logo: `null` (missing/unreadable asset) skips the image entirely —
  // the export must never fail over branding.
  if (input.logo) {
    // exceljs's typings declare its own `Buffer` interface (extends
    // ArrayBuffer) — a Node Buffer carries the same bytes but a different
    // branded toStringTag, so a narrow cast is required at this boundary.
    const imageId = workbook.addImage({
      buffer: input.logo as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 }, // anchors over the reserved A1:C2 zone
      ext: { width: 100, height: 29 }, // 201×59 source scaled ~50%
    });
  }

  return workbook;
}

/** Serialize the workbook to a Node `Buffer` (.xlsx bytes). */
export async function generarValoracionesExcelBuffer(
  input: ValoracionesExcelInput,
): Promise<Buffer> {
  const workbook = generarValoracionesExcelWorkbook(input);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
