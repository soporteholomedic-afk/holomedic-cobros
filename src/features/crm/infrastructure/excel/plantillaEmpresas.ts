import ExcelJS from 'exceljs';

import { ENCABEZADOS_PLANTILLA } from './leerExcelEmpresas';

const ANCHOS = [34, 16, 26, 26, 16, 30];

/**
 * The empty template the user downloads: one sheet with the six headers and no
 * data rows (an untouched upload imports nothing). RUC and phone columns are
 * text so Excel keeps their digits as typed.
 */
export async function generarPlantillaEmpresas(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Empresas');
  hoja.columns = ENCABEZADOS_PLANTILLA.map((encabezado, i) => ({
    header: encabezado,
    width: ANCHOS[i],
    style: i === 1 || i === 4 ? { numFmt: '@' } : {},
  }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}
