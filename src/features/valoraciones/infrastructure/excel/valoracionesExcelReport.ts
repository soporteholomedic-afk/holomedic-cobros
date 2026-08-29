import ExcelJS from 'exceljs';

import { nombreEmpresa, round2, totalesDe, ventaPorMoneda } from '../../domain/agrupacion';
import type { CodigoMoneda, RepFacturacion } from '../../domain/entities';
import type { Membrete } from '../pdf/template';

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

  const nombreCell = sheet.getCell('D1');
  nombreCell.value = input.membrete.nombre;
  nombreCell.font = { bold: true };
  sheet.mergeCells('D1:H1');

  sheet.getCell('D2').value = `RUC: ${input.membrete.ruc}`;
  sheet.mergeCells('D2:H2');

  if (input.cliente) {
    const clienteCell = sheet.getCell('J1');
    clienteCell.value = input.cliente.nombre;
    clienteCell.font = { bold: true };
    sheet.mergeCells('J1:O1');

    if (input.cliente.ruc !== '') {
      sheet.getCell('J2').value = `RUC: ${input.cliente.ruc}`;
      sheet.mergeCells('J2:O2');
    }
  }

  sheet.getCell('D3').value = `Período: ${fechaDisplay(input.fecIni)} – ${fechaDisplay(input.fecFin)}`;
  sheet.mergeCells('D3:H3');

  sheet.getCell('D4').value = `Moneda: ${input.moneda.descripcion} (${input.moneda.simbol})`;
  sheet.mergeCells('D4:H4');

  sheet.getCell('D5').value = `Fecha de emisión: ${input.fechaEmision}`;
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
  input.rows.forEach((row, index) => {
    const dataRow = sheet.getRow(8 + index);
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
    valores.forEach((valor, columna) => {
      if (valor === null) return; // date columns handled below
      dataRow.getCell(columna + 1).value = valor;
    });

    const costoCell = dataRow.getCell(15);
    costoCell.value = round2(ventaPorMoneda(row, input.moneda.codMon));
    costoCell.numFmt = '#,##0.00';

    // Real date cells, UTC-anchored (no TZ day-shift); NULL → empty.
    const fechaNacCell = dataRow.getCell(8);
    if (row.FecNac) {
      fechaNacCell.value = fechaUtc(row.FecNac);
      fechaNacCell.numFmt = FORMATO_FECHA;
    }
    const feordenCell = dataRow.getCell(11);
    feordenCell.value = fechaUtc(row.FecAte);
    feordenCell.numFmt = FORMATO_FECHA;
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
    const row = sheet.getRow(firstTotalsRow + index);
    row.getCell(13).value = fila.label; // M
    sheet.mergeCells(firstTotalsRow + index, 13, firstTotalsRow + index, 14);
    row.getCell(13).alignment = { horizontal: 'right' };

    const valueCell = row.getCell(15); // O
    valueCell.value = fila.value;
    valueCell.numFmt = '#,##0.00';

    if (fila.bold) {
      row.getCell(13).font = { bold: true };
      valueCell.font = { bold: true };
    }
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
  const headerStyle = {
    font: { bold: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
  } as const;
  COLUMNAS_FIJAS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.style = headerStyle;
  });
  const costoCell = headerRow.getCell(15);
  costoCell.value = etiquetaCosto(input.moneda.codMon);
  costoCell.style = headerStyle;

  ANCHOS.forEach(([columna, ancho]) => {
    sheet.getColumn(columna).width = ancho;
  });

  escribirFilasDatos(sheet, input);
  escribirBloqueTotales(sheet, input);

  // Sheet usability & print layout (spec R4): frozen header, autofilter
  // over the data region ONLY (totals excluded), A4 landscape fit-to-width
  // with the header row repeated on every printed page.
  sheet.views = [{ state: 'frozen', ySplit: 7 }];
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
