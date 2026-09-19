import { describe, expect, it } from 'vitest';

import ExcelJS from 'exceljs';

import { parsearPlantillaCrm, PlantillaSinHojaDatosError } from '../parsearPlantillaCliente';
import { COLUMNAS_IMPORT_CRM, HOJA_DATOS } from '../../../domain/importar/columnas';

/**
 * Build a workbook with exceljs (the SAME library that generates the
 * official template on the server) and parse its bytes with the
 * browser-side reader under test — an end-to-end round-trip over the
 * real artifact shape.
 */
async function bufferDesdeHojas(
  hojas: { nombre: string; filas: (string | number)[][] }[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  for (const { nombre, filas } of hojas) {
    const sheet = workbook.addWorksheet(nombre);
    filas.forEach((fila) => sheet.addRow(fila));
  }
  const out = await workbook.xlsx.writeBuffer();
  return out as unknown as ArrayBuffer;
}

/** The template's own header row — asterisks included (pr7 contract). */
const ENCABEZADOS_PLANTILLA = COLUMNAS_IMPORT_CRM.map((columna) =>
  columna.requerido ? `${columna.encabezado}*` : columna.encabezado,
);

const FILA_VALORES: (string | number)[] = [
  'Constructora X',
  ' 900-123456 ',
  'Cliente',
  'Inbound',
  'Obra San Isidro',
  'Lima',
  'jperez',
  'Cliente histórico',
  'Ana',
  'ana@x.com; luis@x.com',
  '987654321',
  'Sí',
];

describe('parsearPlantillaCrm', () => {
  it('round-trips the template layout: headers → FilaImportCrm fields', async () => {
    const buffer = await bufferDesdeHojas([
      { nombre: HOJA_DATOS, filas: [ENCABEZADOS_PLANTILLA, FILA_VALORES] },
    ]);

    const filas = parsearPlantillaCrm(buffer);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toEqual({
      empresa: 'Constructora X',
      ruc: ' 900-123456 ',
      tipo: 'Cliente',
      origen: 'Inbound',
      proyectoObra: 'Obra San Isidro',
      destinoComun: 'Lima',
      responsable: 'jperez',
      notas: 'Cliente histórico',
      encargado: 'Ana',
      correos: 'ana@x.com; luis@x.com',
      telefono: '987654321',
      principal: 'Sí',
    });
  });

  it('resolves quirky header variants through the shared normalization', async () => {
    // Same keys with different case/spacing — the template's headers
    // and hand-edited files both resolve via mapearFilasImportCrm.
    const buffer = await bufferDesdeHojas([
      {
        nombre: HOJA_DATOS,
        filas: [
          [' empresa ', 'ruc', 'TIPO', 'encargado *', 'CORREOS'],
          ['Otro S.A.', '876543210', 'Prospecto', 'Marta', 'marta@otra.com'],
        ],
      },
    ]);

    const filas = parsearPlantillaCrm(buffer);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.empresa).toBe('Otro S.A.');
    expect(filas[0]?.ruc).toBe('876543210');
    expect(filas[0]?.tipo).toBe('Prospecto');
    expect(filas[0]?.encargado).toBe('Marta');
    expect(filas[0]?.correos).toBe('marta@otra.com');
    // Unmentioned columns arrive as empty strings, never undefined.
    expect(filas[0]?.telefono).toBe('');
    expect(filas[0]?.principal).toBe('');
  });

  it('rejects a workbook without the "Empresas" data sheet', async () => {
    const buffer = await bufferDesdeHojas([
      { nombre: 'Otra Hoja', filas: [['Empresa'], ['X']] },
    ]);

    expect(() => parsearPlantillaCrm(buffer)).toThrow(PlantillaSinHojaDatosError);
    expect(() => parsearPlantillaCrm(buffer)).toThrow('Empresas');
  });
});
