import ExcelJS from 'exceljs';

import { COLUMNAS_IMPORT_CRM } from '../../domain/importar/columnas';

/**
 * CRM import template builder (tasks pr7/WU1–WU2, spec G3).
 *
 * Pure exceljs construction — no I/O. Every column (order, header text,
 * required flag) derives from the shared `COLUMNAS_IMPORT_CRM` constant;
 * this module keeps NO private column list (anti-drift contract, guarded
 * by `plantillaCrmBuilder.test.ts`).
 */

/** Name of the data worksheet (first sheet of the workbook). */
export const HOJA_DATOS = 'Empresas';

/**
 * Build the template workbook. Required columns are headed with a
 * trailing asterisk — the same marker the importer's header-key
 * normalization strips (pr6), so the template's own headers resolve
 * cleanly back to the column claves.
 */
export function generarPlantillaCrmWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(HOJA_DATOS);

  COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
    sheet.getRow(1).getCell(index + 1).value = columna.requerido
      ? `${columna.encabezado}*`
      : columna.encabezado;
  });

  return workbook;
}
