import ExcelJS from 'exceljs';

import type { FilaProductividad } from '../../application/listarProductividad';
import { EVENTOS_RESULTADO } from '../../domain/maquinaEstados';
import { ETIQUETA_EVENTO_RESULTADO, formatearFecha } from '../../presentation/etiquetas';

/**
 * Productivity Excel export builder (tasks pr17/WU1, spec G6 "exportar
 * Excel"). A LEAN data export — the valoraciones report precedent
 * reduced to what a productivity summary needs: one period title row,
 * one styled 9-column header and one row per `FilaProductividad`.
 * Pure exceljs construction — no I/O, no clock; the async
 * `generarProductividadExcelBuffer` is the only serialization step.
 *
 * Anti-drift: the breakdown columns derive from the shared
 * `EVENTOS_RESULTADO` catalog in domain and their headers from the
 * SAME `ETIQUETA_EVENTO_RESULTADO` labels the `/crm/productividad`
 * table renders — the workbook can never drift from the UI. (The
 * labels module is presentation by location but a pure constant map:
 * importing it here is what makes the shared-source contract hold.)
 *
 * Styling follows the pr7 template conventions: bold white headers on
 * the brand fill (Tailwind `sky-600`, taken from the CRM UI). No
 * dropdowns, no extra sheets — it is a data export, not a template.
 */

/** Name of the single worksheet. */
export const HOJA_PRODUCTIVIDAD = 'Productividad';

/** Brand color = the app's institutional action color (pr7 convention). */
const COLOR_MARCA = 'FF0284C7'; // sky-600

/** Builder input: the validated period plus the summary rows. */
export interface ProductividadExcelInput {
  /** Inclusive window start, 'YYYY-MM-DD' (route-validated). */
  desde: string;
  /** Inclusive window end, 'YYYY-MM-DD' (route-validated). */
  hasta: string;
  /** One summary row per user, in API (usuario-ascending) order. */
  filas: readonly FilaProductividad[];
}

/** Build the workbook. Column order is the export's exact contract. */
export function generarProductividadExcelWorkbook(
  input: ProductividadExcelInput,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(HOJA_PRODUCTIVIDAD);

  // ---- Row 1: title with the period (dd/mm/yyyy display contract) ----
  const titulo = sheet.getRow(1).getCell(1);
  titulo.value = `Productividad — Período: ${formatearFecha(input.desde)} – ${formatearFecha(input.hasta)}`;
  titulo.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  sheet.getRow(1).height = 22;

  // ---- Row 2: the 9-column header (bold white on the brand fill) ----
  const encabezados: string[] = [
    'Usuario',
    'Actividades',
    'Resultados',
    ...EVENTOS_RESULTADO.map((evento) => ETIQUETA_EVENTO_RESULTADO[evento]),
  ];
  encabezados.forEach((encabezado, index) => {
    const cell = sheet.getRow(2).getCell(index + 1);
    cell.value = encabezado;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.getRow(2).height = 24;
  sheet.getColumn(1).width = 22;
  for (let columna = 2; columna <= encabezados.length; columna++) {
    sheet.getColumn(columna).width = 16;
  }

  // ---- Rows 3..N: one row per FilaProductividad ----
  input.filas.forEach((fila, index) => {
    const row = sheet.getRow(3 + index);
    row.getCell(1).value = fila.usuario;
    row.getCell(2).value = fila.actividades;
    row.getCell(3).value = fila.resultados;
    EVENTOS_RESULTADO.forEach((evento, i) => {
      row.getCell(4 + i).value = fila.porEvento[evento];
    });
  });

  return workbook;
}

/** Serialize the workbook to a Node `Buffer` (.xlsx bytes). */
export async function generarProductividadExcelBuffer(
  input: ProductividadExcelInput,
): Promise<Buffer> {
  const workbook = generarProductividadExcelWorkbook(input);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
