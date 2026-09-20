import { describe, expect, it } from 'vitest';

import ExcelJS from 'exceljs';

import { COLUMNAS_IMPORT_CRM } from '@/features/crm/domain/importar/columnas';
import { mapearFilasImportCrm } from '@/features/crm/infrastructure/importar/importadorCrm';
import {
  FILAS_CON_VALIDACION,
  HOJA_DATOS,
  HOJA_INSTRUCCIONES,
  generarPlantillaCrmWorkbook,
} from '../plantillaCrmBuilder';

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

/**
 * Styling contract (spec G3 "Styled, error-proof template"). Brand color
 * is the app's institutional action color: Tailwind `sky-600` (#0284c7),
 * taken from the CRM feature UI itself (EmpresaList's primary button
 * `bg-sky-600` and the /crm spinner `border-sky-600`). Required columns
 * use the darker brand shade `sky-800` (#075985) as their distinct fill.
 */
const COLOR_MARCA = 'FF0284C7'; // sky-600
const COLOR_REQUERIDO = 'FF075985'; // sky-800

describe('plantilla CRM — header styling', () => {
  /** exceljs `Fill` is a union — only the pattern member carries fgColor. */
  function argbRelleno(cell: ExcelJS.Cell): string | undefined {
    return cell.fill?.type === 'pattern' ? cell.fill.fgColor?.argb : undefined;
  }

  it('styles every header cell bold white on a brand fill', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    COLUMNAS_IMPORT_CRM.forEach((_, index) => {
      const cell = sheetDefinida.getRow(1).getCell(index + 1);
      expect(cell.font?.bold, `columna ${index + 1} negrita`).toBe(true);
      expect(cell.font?.color?.argb, `columna ${index + 1} texto blanco`).toBe(
        'FFFFFFFF',
      );
      // Brand family — the exact per-column split is pinned below.
      expect([COLOR_MARCA, COLOR_REQUERIDO]).toContain(
        argbRelleno(cell),
      );
    });
  });

  it('gives required columns the distinct darker fill', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
      const cell = sheetDefinida.getRow(1).getCell(index + 1);
      const rellenoEsperado = columna.requerido ? COLOR_REQUERIDO : COLOR_MARCA;
      expect(argbRelleno(cell), `columna ${columna.clave}`).toBe(
        rellenoEsperado,
      );
    });
  });
});

describe('plantilla CRM — TEXT format for RUC and Teléfono', () => {
  const CLAVES_TEXTO = ['ruc', 'telefono'];

  it.each(CLAVES_TEXTO)('formats the "%s" column as TEXT ("@")', (clave) => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    const numeroColumna = COLUMNAS_IMPORT_CRM.findIndex(
      (columna) => columna.clave === clave,
    );
    expect(numeroColumna).toBeGreaterThanOrEqual(0);

    // Column-level numFmt is what Excel applies to cells the user types
    // into on an empty template (verified to round-trip and propagate).
    expect(sheetDefinida.getColumn(numeroColumna + 1).numFmt).toBe('@');
    expect(sheetDefinida.getCell(2, numeroColumna + 1).numFmt).toBe('@');
  });

  it('leaves non-TEXT columns in general format', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    const numeroTipo = COLUMNAS_IMPORT_CRM.findIndex(
      (columna) => columna.clave === 'tipo',
    );
    expect(sheetDefinida.getColumn(numeroTipo + 1).numFmt).not.toBe('@');
  });
});

describe('plantilla CRM — data validation dropdowns', () => {
  function validacion(clave: string, fila: number): ExcelJS.DataValidation | undefined {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;
    const numeroColumna = COLUMNAS_IMPORT_CRM.findIndex(
      (columna) => columna.clave === clave,
    );
    expect(numeroColumna).toBeGreaterThanOrEqual(0);
    return sheetDefinida.getCell(fila, numeroColumna + 1).dataValidation;
  }

  function validarDesplegable(clave: string): void {
    const columna = COLUMNAS_IMPORT_CRM.find((c) => c.clave === clave);
    const opciones = columna?.opciones;
    expect(opciones).toBeDefined();
    if (!opciones) throw new Error(`la columna ${clave} no define opciones`);
    const esperado = `"${opciones.join(',')}"`;

    // First data row, a middle row, and the last validated row all carry
    // the dropdown; one row past the range does not.
    for (const fila of [2, 101, FILAS_CON_VALIDACION + 1]) {
      const validacionCelda = validacion(clave, fila);
      expect(validacionCelda?.type, `fila ${fila}`).toBe('list');
      expect(validacionCelda?.formulae, `fila ${fila}`).toEqual([esperado]);
      expect(validacionCelda?.allowBlank, `fila ${fila}`).toBe(true);
    }
    expect(validacion(clave, FILAS_CON_VALIDACION + 2)?.type).toBeUndefined();
  }

  it('offers only Cliente/Prospecto in the Tipo column', () => {
    validarDesplegable('tipo');
  });

  it('offers only Inbound/Outbound in the Origen column', () => {
    validarDesplegable('origen');
  });

  it('derives the Principal dropdown from the shared constant options', () => {
    validarDesplegable('principal');
  });
});

describe('plantilla CRM — column widths', () => {
  it('gives every column a sensible readable width', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    COLUMNAS_IMPORT_CRM.forEach((columna, index) => {
      const ancho = sheetDefinida.getColumn(index + 1).width;
      expect(ancho, `columna ${columna.clave}`).toBeGreaterThanOrEqual(10);
    });
  });

  it('widens the long-text columns (Empresa, Notas, Correos)', () => {
    const sheet = generarPlantillaCrmWorkbook().getWorksheet(HOJA_DATOS);
    expect(sheet).toBeDefined();
    const sheetDefinida = sheet as ExcelJS.Worksheet;

    for (const clave of ['empresa', 'notas', 'correos']) {
      const numeroColumna = COLUMNAS_IMPORT_CRM.findIndex(
        (columna) => columna.clave === clave,
      );
      expect(sheetDefinida.getColumn(numeroColumna + 1).width).toBeGreaterThanOrEqual(24);
    }
  });
});

describe('plantilla CRM — Instrucciones sheet', () => {
  function textoInstrucciones(): string {
    const workbook = generarPlantillaCrmWorkbook();
    const hojaDatos = workbook.getWorksheet(HOJA_DATOS);
    expect(hojaDatos).toBeDefined();
    const hoja = workbook.getWorksheet(HOJA_INSTRUCCIONES);
    expect(hoja, `la hoja "${HOJA_INSTRUCCIONES}" existe`).toBeDefined();

    const lineas: string[] = [];
    (hoja as ExcelJS.Worksheet).eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.text.trim() !== '') lineas.push(cell.text);
      });
    });
    return lineas.join('\n');
  }

  it('is the second sheet, after the data sheet', () => {
    const workbook = generarPlantillaCrmWorkbook();
    expect(workbook.worksheets.map((hoja) => hoja.name)).toEqual([
      HOJA_DATOS,
      HOJA_INSTRUCCIONES,
    ]);
  });

  it('explains the one-row-per-encargado and repeat-RUC pattern', () => {
    const texto = textoInstrucciones();
    expect(texto).toMatch(/un encargado/i);
    expect(texto).toMatch(/repita el RUC/i);
  });

  it('explains that RUC and Teléfono are text to preserve leading zeros', () => {
    const texto = textoInstrucciones();
    expect(texto).toMatch(/RUC y el Teléfono/i);
    expect(texto).toMatch(/como texto/i);
    expect(texto).toMatch(/ceros iniciales/i);
  });

  it('marks the required (asterisked) columns', () => {
    const texto = textoInstrucciones();
    expect(texto).toMatch(/asterisco/i);
    expect(texto).toMatch(/obligatori/i);
    for (const requerida of ['Empresa', 'RUC', 'Tipo', 'Encargado', 'Correos']) {
      expect(texto).toContain(requerida);
    }
  });

  it('explains the upsert-by-RUC rule', () => {
    const texto = textoInstrucciones();
    expect(texto).toMatch(/ya existe/i);
    expect(texto).toMatch(/actualiza/i);
    expect(texto).toMatch(/no se duplica/i);
  });

  it('points users to the Tipo and Origen dropdowns', () => {
    const texto = textoInstrucciones();
    expect(texto).toMatch(/desplegable/i);
    expect(texto).toMatch(/Tipo y Origen/i);
  });
});
