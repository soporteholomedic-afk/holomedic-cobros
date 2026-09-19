import ExcelJS from 'exceljs';

import { COLUMNAS_IMPORT_CRM } from '../../domain/importar/columnas';

/**
 * CRM import template builder (tasks pr7/WU1–WU2, spec G3).
 *
 * Pure exceljs construction — no I/O. Every column (order, header text,
 * required flag, dropdown options) derives from the shared
 * `COLUMNAS_IMPORT_CRM` constant; this module keeps NO private column
 * list (anti-drift contract, guarded by `plantillaCrmBuilder.test.ts`).
 *
 * Error-proofing (spec G3): bold white headers on the brand fill,
 * required columns asterisked with a distinct darker fill, RUC/Teléfono
 * forced to TEXT (`@` numFmt — no scientific notation, no leading-zero
 * loss), dropdown validation for every list-type column, readable
 * widths, and an "Instrucciones" sheet (Spanish) explaining the
 * one-row-per-encargado / repeat-RUC / upsert-by-RUC rules.
 */

/** Name of the data worksheet (first sheet of the workbook). */
export const HOJA_DATOS = 'Empresas';

/** Name of the instructions worksheet (second sheet). */
export const HOJA_INSTRUCCIONES = 'Instrucciones';

/**
 * Data rows (2..N) receiving dropdown validation. 1000 rows comfortably
 * covers a hand-filled template; the 2000-row import cap (pr6) is a
 * server-side limit and needs no mirror here.
 */
export const FILAS_CON_VALIDACION = 1000;

/**
 * Brand color = the app's institutional action color, Tailwind
 * `sky-600` (#0284c7), taken from the CRM feature UI itself:
 * `EmpresaList.tsx` primary button `bg-sky-600`, `/crm/page.tsx` spinner
 * `border-sky-600`. Required columns use the darker brand shade
 * `sky-800` (#075985) as their distinct fill.
 */
const COLOR_MARCA = 'FF0284C7'; // sky-600
const COLOR_REQUERIDO = 'FF075985'; // sky-800

/** Sensible widths per column clave (readable defaults, not a contract). */
const ANCHOS: Record<string, number> = {
  empresa: 28,
  ruc: 16,
  tipo: 12,
  origen: 12,
  proyectoObra: 24,
  destinoComun: 20,
  responsable: 18,
  notas: 32,
  encargado: 24,
  correos: 32,
  telefono: 16,
  principal: 12,
};

/** Columns forcing TEXT entry (leading zeros / no scientific notation). */
const CLAVES_FORMATO_TEXTO: readonly string[] = ['ruc', 'telefono'];

/** Instrucciones sheet lines (Spanish — user-facing template content). */
const LINEAS_INSTRUCCIONES: readonly string[] = [
  'Instrucciones para completar la plantilla',
  '',
  '1. Cada fila representa UN encargado de una empresa.',
  '2. Para registrar varios encargados de la misma empresa, repita el RUC y los datos de la empresa en cada fila.',
  '3. Escriba el RUC y el Teléfono como texto: las columnas ya tienen formato Texto para no perder ceros iniciales ni convertir los números a notación científica.',
  '4. Las columnas marcadas con asterisco (*) son obligatorias: Empresa, RUC, Tipo, Encargado y Correos.',
  '5. Si el RUC ya existe, la importación actualiza la empresa y sus contactos; no se duplica ninguna empresa ni contacto.',
  '6. Use los menús desplegables de las columnas Tipo y Origen para elegir valores válidos.',
];

/**
 * Build the template workbook. Required columns are headed with a
 * trailing asterisk — the same marker the importer's header-key
 * normalization strips (pr6), so the template's own headers resolve
 * cleanly back to the column claves.
 */
export function generarPlantillaCrmWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(HOJA_DATOS);

  // ---- Header row ----
  COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
    const cell = sheet.getRow(1).getCell(index + 1);
    cell.value = columna.requerido ? `${columna.encabezado}*` : columna.encabezado;
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: columna.requerido ? COLOR_REQUERIDO : COLOR_MARCA },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.getRow(1).height = 24;

  // ---- Column widths + TEXT numFmt ----
  COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = ANCHOS[columna.clave] ?? 16;
    if (CLAVES_FORMATO_TEXTO.includes(columna.clave)) {
      column.numFmt = '@';
    }
  });

  // ---- Dropdown validation for every list-type column ----
  COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
    if (columna.tipo !== 'lista' || !columna.opciones) return;
    const formulae = [`"${columna.opciones.join(',')}"`];
    for (let fila = 2; fila <= FILAS_CON_VALIDACION + 1; fila++) {
      sheet.getCell(fila, index + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae,
      };
    }
  });

  // ---- Instrucciones sheet ----
  const instrucciones = workbook.addWorksheet(HOJA_INSTRUCCIONES);
  instrucciones.getColumn(1).width = 110;
  LINEAS_INSTRUCCIONES.forEach((linea, index) => {
    const cell = instrucciones.getRow(index + 1).getCell(1);
    cell.value = linea;
    if (index === 0) {
      cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: COLOR_MARCA } };
    } else {
      cell.alignment = { wrapText: true, vertical: 'top' };
    }
  });

  return workbook;
}
