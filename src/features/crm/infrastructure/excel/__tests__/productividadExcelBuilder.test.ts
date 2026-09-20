import { describe, expect, it } from 'vitest';

import ExcelJS from 'exceljs';

import type { FilaProductividad } from '@/features/crm/application/listarProductividad';
import { EVENTOS_RESULTADO } from '@/features/crm/domain/maquinaEstados';
import { ETIQUETA_EVENTO_RESULTADO } from '@/features/crm/presentation/etiquetas';
import {
  HOJA_PRODUCTIVIDAD,
  generarProductividadExcelBuffer,
  generarProductividadExcelWorkbook,
} from '../productividadExcelBuilder';

/**
 * Productivity Excel export builder (tasks pr17/WU1, spec G6
 * "exportar Excel", valoraciones/pr7 precedents): a LEAN data export —
 * one period title row, one 9-column header (Usuario / Actividades /
 * Resultados + the D4 breakdown under the SHARED Spanish labels), one
 * row per FilaProductividad. The workbook is built and re-loaded fully
 * in memory (exceljs write → load round-trip), asserting what a
 * consumer actually reads back.
 *
 * Anti-drift contract: the breakdown headers derive from the SAME
 * `ETIQUETA_EVENTO_RESULTADO` constant the HTML table renders — a
 * private header list here fails these tests.
 */

const filaJperez: FilaProductividad = {
  usuario: 'jperez',
  actividades: 10,
  resultados: 3,
  porEvento: {
    CotizaciónEnviada: 2,
    PresentaciónEnviada: 0,
    AceptaciónOutbound: 0,
    ConfirmaciónPresentación: 1,
    HandoffRegistrado: 0,
    ConversiónProspectoACliente: 1,
  },
};

const filaMgarcia: FilaProductividad = {
  usuario: 'mgarcia',
  actividades: 4,
  resultados: 0,
  porEvento: {
    CotizaciónEnviada: 0,
    PresentaciónEnviada: 0,
    AceptaciónOutbound: 0,
    ConfirmaciónPresentación: 0,
    HandoffRegistrado: 0,
    ConversiónProspectoACliente: 0,
  },
};

/** Literal header contract (double lock, plantilla test precedent). */
const ENCABEZADOS_ESPERADOS = [
  'Usuario',
  'Actividades',
  'Resultados',
  'Cotización enviada',
  'Presentación enviada',
  'Aceptación outbound',
  'Confirmación de presentación',
  'Handoff registrado',
  'Conversión a cliente',
] as const;

function hojaDe(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(HOJA_PRODUCTIVIDAD);
  expect(sheet).toBeDefined();
  return sheet as ExcelJS.Worksheet;
}

function leerEncabezados(sheet: ExcelJS.Worksheet): string[] {
  const fila = sheet.getRow(2);
  return ENCABEZADOS_ESPERADOS.map((_, index) => fila.getCell(index + 1).text);
}

describe('productividad Excel builder — sheet & title', () => {
  it('exposes a single data sheet named "Productividad"', () => {
    const workbook = generarProductividadExcelWorkbook({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      filas: [filaJperez],
    });

    expect(workbook.worksheets.map((hoja) => hoja.name)).toEqual([HOJA_PRODUCTIVIDAD]);
    expect(HOJA_PRODUCTIVIDAD).toBe('Productividad');
  });

  it('carries the period in the title row as dd/mm/yyyy – dd/mm/yyyy', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez],
      }),
    );

    const titulo = sheet.getRow(1).getCell(1).text;
    expect(titulo).toContain('Período');
    expect(titulo).toContain('01/09/2026');
    expect(titulo).toContain('30/09/2026');
  });
});

describe('productividad Excel builder — header contract', () => {
  it('renders the 9-column header: usuario, actividades, resultados + the 6 D4 events', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez],
      }),
    );

    expect(leerEncabezados(sheet)).toEqual([...ENCABEZADOS_ESPERADOS]);
  });

  it('derives the breakdown headers from the SHARED table labels (anti-drift)', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez],
      }),
    );

    EVENTOS_RESULTADO.forEach((evento, index) => {
      const celda = sheet.getRow(2).getCell(index + 4).text;
      expect(celda, `columna de ${evento}`).toBe(ETIQUETA_EVENTO_RESULTADO[evento]);
    });
  });
});

describe('productividad Excel builder — header styling (pr7 conventions)', () => {
  it('styles every header cell bold white on the brand fill', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez],
      }),
    );

    for (let columna = 1; columna <= ENCABEZADOS_ESPERADOS.length; columna++) {
      const cell = sheet.getRow(2).getCell(columna);
      expect(cell.font?.bold, `columna ${columna} negrita`).toBe(true);
      expect(cell.font?.color?.argb, `columna ${columna} texto blanco`).toBe('FFFFFFFF');
      expect(cell.fill?.fgColor?.argb, `columna ${columna} relleno marca`).toBe('FF0284C7');
    }
  });

  it('distinguishes the title row from the header row (title is NOT on the brand fill)', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez],
      }),
    );

    const titulo = sheet.getRow(1).getCell(1);
    expect(titulo.font?.bold).toBe(true);
    expect(titulo.fill?.fgColor?.argb).toBeUndefined();
  });
});

describe('productividad Excel builder — data rows', () => {
  it('writes one row per FilaProductividad with the zero-filled breakdown', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [filaJperez, filaMgarcia],
      }),
    );

    expect(sheet.getRow(3).getCell(1).text).toBe('jperez');
    expect(sheet.getRow(3).getCell(2).value).toBe(10);
    expect(sheet.getRow(3).getCell(3).value).toBe(3);
    expect(sheet.getRow(3).getCell(4).value).toBe(2); // Cotización enviada
    expect(sheet.getRow(3).getCell(5).value).toBe(0); // Presentación enviada
    expect(sheet.getRow(3).getCell(6).value).toBe(0); // Aceptación outbound
    expect(sheet.getRow(3).getCell(7).value).toBe(1); // Confirmación de presentación
    expect(sheet.getRow(3).getCell(8).value).toBe(0); // Handoff registrado
    expect(sheet.getRow(3).getCell(9).value).toBe(1); // Conversión a cliente

    expect(sheet.getRow(4).getCell(1).text).toBe('mgarcia');
    expect(sheet.getRow(4).getCell(2).value).toBe(4);
    expect(sheet.getRow(4).getCell(3).value).toBe(0);
  });

  it('writes headers only when there are no rows (empty period)', () => {
    const sheet = hojaDe(
      generarProductividadExcelWorkbook({
        desde: '2026-09-01',
        hasta: '2026-09-30',
        filas: [],
      }),
    );

    expect(leerEncabezados(sheet)).toEqual([...ENCABEZADOS_ESPERADOS]);
    // exceljs models an untouched cell's value as null.
    expect(sheet.getRow(3).getCell(1).value).toBeNull();
  });
});

describe('productividad Excel builder — buffer serialization', () => {
  it('serializes to .xlsx bytes that load back with the same data', async () => {
    const buffer = await generarProductividadExcelBuffer({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      filas: [filaJperez],
    });
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = hojaDe(workbook);

    expect(leerEncabezados(sheet)).toEqual([...ENCABEZADOS_ESPERADOS]);
    expect(sheet.getRow(3).getCell(1).text).toBe('jperez');
    expect(sheet.getRow(3).getCell(2).value).toBe(10);
  });
});
