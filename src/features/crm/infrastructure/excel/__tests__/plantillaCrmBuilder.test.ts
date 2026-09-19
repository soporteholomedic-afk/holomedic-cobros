import { describe, expect, it } from 'vitest';

import ExcelJS from 'exceljs';

import { COLUMNAS_IMPORT_CRM } from '@/features/crm/domain/importar/columnas';
import { mapearFilasImportCrm } from '@/features/crm/infrastructure/importar/importadorCrm';
import { HOJA_DATOS, generarPlantillaCrmWorkbook } from '../plantillaCrmBuilder';

/**
 * Drift guard (spec G3 "Single shared column definition"): the template
 * workbook built by `plantillaCrmBuilder` must expose EXACTLY the columns
 * of `COLUMNAS_IMPORT_CRM` — same order, asterisks mirroring the required
 * flags — and the importer (`mapearFilasImportCrm`, pr6) must resolve each
 * template header back to its stable clave through its own header-key
 * normalization. If either side ever keeps a private list, these tests
 * fail.
 *
 * The workbook is built and re-loaded fully in memory (exceljs write →
 * load round-trip), asserting what a consumer actually reads back.
 */

/** Literal PRD-rev-3 header row (double lock: constant drift also fails). */
const ENCABEZADOS_ESPERADOS = [
  'Empresa*',
  'RUC*',
  'Tipo*',
  'Origen',
  'Proyecto/Obra',
  'Destino Común',
  'Responsable',
  'Notas',
  'Encargado*',
  'Correos*',
  'Teléfono',
  'Principal',
] as const;

function leerEncabezados(sheet: ExcelJS.Worksheet): string[] {
  const fila = sheet.getRow(1);
  return COLUMNAS_IMPORT_CRM.map((_, index) => fila.getCell(index + 1).text);
}

describe('plantilla CRM — drift guard', () => {
  it('exposes the data sheet first, named "Empresas"', () => {
    const workbook = generarPlantillaCrmWorkbook();

    expect(workbook.worksheets[0]?.name).toBe(HOJA_DATOS);
    expect(workbook.getWorksheet(HOJA_DATOS)).toBeDefined();
  });

  it('renders one header per constant column, in constant order', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    expect(leerEncabezados(sheetDefinida)).toEqual([...ENCABEZADOS_ESPERADOS]);
    expect(leerEncabezados(sheetDefinida)).toEqual(
      COLUMNAS_IMPORT_CRM.map((columna) =>
        columna.requerido ? `${columna.encabezado}*` : columna.encabezado,
      ),
    );
  });

  it('asterisks exactly the required columns (Empresa, RUC, Tipo, Encargado, Correos)', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    const asteriscados = leerEncabezados(sheetDefinida)
      .filter((encabezado) => encabezado.endsWith('*'))
      .map((encabezado) => encabezado.slice(0, -1));

    expect(asteriscados).toEqual(
      COLUMNAS_IMPORT_CRM.filter((columna) => columna.requerido).map(
        (columna) => columna.encabezado,
      ),
    );
  });

  it('the importer resolves every template header back to its clave', () => {
    // The pr6 mapper receives rows keyed by whatever the user's sheet
    // headers say. Feeding it the template's own headers must fill every
    // clave — no gap and no cross-mapping (G3 anti-drift contract).
    const filaBruta: Record<string, string> = {};
    COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
      const encabezado = columna.requerido
        ? `${columna.encabezado}*`
        : columna.encabezado;
      filaBruta[encabezado] = `valor-${index}`;
    });

    const [fila] = mapearFilasImportCrm([filaBruta]);

    COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
      expect(fila[columna.clave as keyof typeof fila]).toBe(`valor-${index}`);
    });
  });
});
