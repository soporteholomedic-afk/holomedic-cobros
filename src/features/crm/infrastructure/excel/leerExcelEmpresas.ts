import ExcelJS from 'exceljs';

import { ArchivoImportacionInvalidoError } from '../../domain/errors';

/** Template columns, in this exact order. The marks tell the user what is required. */
export const ENCABEZADOS_PLANTILLA = [
  'Razón social *',
  'RUC *',
  'Sector *',
  'Contacto *',
  'Teléfono *',
  'Correo (opcional)',
] as const;

/** Most data rows one file can carry (a limit of ours, not of the design). */
export const MAX_FILAS_IMPORTACION = 1000;

/** One data row exactly as written in the sheet (text only, nothing validated yet). */
export interface FilaExcelEmpresa {
  /** Excel row number: the header is row 1, so data starts at 2. */
  fila: number;
  razonSocial: string;
  ruc: string;
  sector: string;
  contacto: string;
  telefono: string;
  correo: string;
}

/** Header comparison ignores case, the "*" mark and the "(opcional)" note. */
function normalizarEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/\(opcional\)/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visible text of a cell, whatever its type (number, rich text, hyperlink, formula…). */
function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor).trim();
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('').trim();
    if ('text' in valor) return textoDeCelda(valor.text as ExcelJS.CellValue);
    if ('result' in valor) return textoDeCelda(valor.result as ExcelJS.CellValue);
  }
  return '';
}

const COLUMNAS_INVALIDAS =
  'El archivo no tiene las columnas de la plantilla. Descarga la plantilla y vuelve a intentarlo.';

/**
 * Read the first sheet of an .xlsx as raw rows. Pure: no storage, no rules about
 * RUC or phone (those belong to the import use case). Blank rows are skipped.
 * Throws `ArchivoImportacionInvalidoError` with a user-facing message.
 */
export async function leerExcelEmpresas(buffer: Buffer): Promise<FilaExcelEmpresa[]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ArchivoImportacionInvalidoError(
      'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.',
    );
  }

  const hoja = libro.worksheets[0];
  if (!hoja) throw new ArchivoImportacionInvalidoError('El archivo no tiene filas con datos.');

  const esperados = ENCABEZADOS_PLANTILLA.map(normalizarEncabezado);
  const encabezados = hoja.getRow(1);
  const coincide = esperados.every(
    (esperado, i) => normalizarEncabezado(textoDeCelda(encabezados.getCell(i + 1).value)) === esperado,
  );
  if (!coincide) throw new ArchivoImportacionInvalidoError(COLUMNAS_INVALIDAS);

  const filas: FilaExcelEmpresa[] = [];
  hoja.eachRow((row, numero) => {
    if (numero === 1) return;
    const [razonSocial, ruc, sector, contacto, telefono, correo] = esperados.map((_, i) =>
      textoDeCelda(row.getCell(i + 1).value),
    );
    if ([razonSocial, ruc, sector, contacto, telefono, correo].every((t) => t === '')) return;
    filas.push({ fila: numero, razonSocial, ruc, sector, contacto, telefono, correo });
  });

  if (filas.length === 0) throw new ArchivoImportacionInvalidoError('El archivo no tiene filas con datos.');
  if (filas.length > MAX_FILAS_IMPORTACION) {
    throw new ArchivoImportacionInvalidoError(
      `El archivo tiene más de ${MAX_FILAS_IMPORTACION} filas. Divídelo en partes más pequeñas.`,
    );
  }
  return filas;
}
