// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { ENCABEZADOS_PLANTILLA, leerExcelEmpresas } from '../leerExcelEmpresas';
import { generarPlantillaEmpresas } from '../plantillaEmpresas';

async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('generarPlantillaEmpresas', () => {
  it('builds one sheet "Empresas" whose first row holds the six template headers, in order', async () => {
    const wb = await abrir(await generarPlantillaEmpresas());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Empresas']);
    const fila = wb.worksheets[0].getRow(1);
    expect(ENCABEZADOS_PLANTILLA.map((_, i) => fila.getCell(i + 1).value)).toEqual([...ENCABEZADOS_PLANTILLA]);
  });

  it('has no data rows, so uploading it untouched imports nothing instead of a made-up empresa', async () => {
    const wb = await abrir(await generarPlantillaEmpresas());
    expect(wb.worksheets[0].rowCount).toBe(1);
    await expect(leerExcelEmpresas(await generarPlantillaEmpresas())).rejects.toThrow('El archivo no tiene filas con datos.');
  });

  it('keeps RUC and phone columns as text so Excel does not turn them into numbers', async () => {
    const hoja = (await abrir(await generarPlantillaEmpresas())).worksheets[0];
    expect(hoja.getColumn(2).numFmt).toBe('@');
    expect(hoja.getColumn(5).numFmt).toBe('@');
  });

  it('can be filled in and read back by the reader', async () => {
    const wb = await abrir(await generarPlantillaEmpresas());
    wb.worksheets[0].addRow(['Textiles Norte S.A.', '20603334445', 'Fábrica y Producción', 'Elena Ruiz', '985 333 444', '']);
    const relleno = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await leerExcelEmpresas(relleno)).toEqual([
      { fila: 2, razonSocial: 'Textiles Norte S.A.', ruc: '20603334445', sector: 'Fábrica y Producción', contacto: 'Elena Ruiz', telefono: '985 333 444', correo: '' },
    ]);
  });
});
