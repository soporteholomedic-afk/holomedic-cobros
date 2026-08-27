import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { makeRepFacturacion } from '../../../domain/fixtures';
import { FORMATO_35_HEADER, generarFormato35Workbook } from '../formato35';

describe('FORMATO_35_HEADER', () => {
  it('matches the 30 SIGLA CSV-export columns exactly (spec E-R3)', () => {
    expect(FORMATO_35_HEADER).toEqual([
      'facturar a',
      'contratades',
      'proyectodes',
      'cr_proy',
      'dociden',
      'nombre',
      'edad',
      'Fecha de Nacimiento',
      'ocupacion',
      'tipotrab',
      'feorden',
      'fesoliciTramAdm',
      'tipo_examen',
      'perfil',
      'resultado',
      'anexo7d',
      'total',
      'solicitado',
      'administrador',
      'ficha',
      'item',
      'tcompro',
      'nrodoc',
      'nrovalor',
      'ordpedi',
      'cod_em',
      'fec_rec',
      'cancela',
      'sede_cob',
      'nro_cob',
    ]);
    expect(FORMATO_35_HEADER).toHaveLength(30);
  });
});

describe('generarFormato35Workbook', () => {
  it('builds one sheet whose first row equals the exact header', () => {
    const wb = generarFormato35Workbook([makeRepFacturacion()], 1);
    expect(wb.SheetNames).toHaveLength(1);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    expect(aoa[0]).toEqual(FORMATO_35_HEADER);
  });

  it('maps a row to the 30 columns mirroring SIGLA GenerarData (moneda-aware total)', () => {
    const row = makeRepFacturacion({
      NomCFa: 'FACTURAR A DEMO',
      NomCom: 'CONTRATANTE DEMO',
      DesDes: 'PROYECTO NORTE',
      CenCos: 'CR-001',
      NroDId: 'DNI 46145583',
      Pacien: 'PACIENTE UNO',
      EdaPac: 34,
      FecNac: '1992-03-14T00:00:00.000Z',
      DesPue: 'ANALISTA',
      DsTiTr: 'EMPLEADO',
      FecAte: '2026-01-15T00:00:00.000Z',
      FecSTA: '2026-01-17T00:00:00.000Z',
      DesTCh: 'PREOCUPACIONAL',
      NomPro: 'PERFIL DEMO',
      Result: 'APTO',
      Anex7D: 'S',
      VVtaMN: 100,
      VVtaMO: 30,
      Solici: 'SOLICITANTE',
      Admini: 'ADMIN',
      IdAten: '000123',
      ItemEx: 2,
      TipDov: 'FT',
      NumDov: 45678,
      NroVal: 'V0001',
      NroOPe: 'O0001',
      CodiEM: 'EM01',
      FecRec: '2026-01-20T00:00:00.000Z',
      EstCob: 'P',
      CodSeC: 1,
      NumCob: 1234,
    });

    const wb = generarFormato35Workbook([row], 1);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[1]).toEqual([
      'FACTURAR A DEMO',
      'CONTRATANTE DEMO',
      'PROYECTO NORTE',
      'CR-001',
      'DNI 46145583', // hyphens preserved — deliberate improvement over SIGLA's CSV
      'PACIENTE UNO',
      34,
      '14/03/1992',
      'ANALISTA',
      'EMPLEADO',
      '15/01/2026',
      '17/01/2026',
      'PREOCUPACIONAL',
      'PERFIL DEMO',
      'APTO',
      'S',
      100, // SOLES → VVtaMN
      'SOLICITANTE',
      'ADMIN',
      'Id: 000123',
      2,
      'FT',
      45678,
      'V0001',
      'O0001',
      'EM01',
      '20/01/2026',
      'P',
      1,
      1234,
    ]);
  });

  it('uses VVtaMO when codMon is 2 and renders nullable cells as blanks', () => {
    const row = makeRepFacturacion({
      FecNac: null,
      FecSTA: null,
      NumDov: null,
      CodSeC: null,
      NumCob: null,
      FecRec: null,
      VVtaMN: 100,
      VVtaMO: 42.5,
    });

    const wb = generarFormato35Workbook([row], 2);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const celda = aoa[1];
    expect(celda[16]).toBe(42.5); // DOLARES → VVtaMO
    expect(celda[7]).toBe(''); // Fecha de Nacimiento NULL → '' (SIGLA uses '-')
    expect(celda[11]).toBe('');
    expect(celda[22]).toBe('');
    expect(celda[26]).toBe('');
    expect(celda[28]).toBe('');
    expect(celda[29]).toBe('');
  });

  it('rounds the total to two decimals', () => {
    const row = makeRepFacturacion({ VVtaMN: 100.129, VVtaMO: 0 });
    const wb = generarFormato35Workbook([row], 1);
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(aoa[1][16]).toBe(100.13);
  });

  it('produces a buffer that XLSX can re-read (valid .xlsx round-trip)', () => {
    const wb = generarFormato35Workbook([makeRepFacturacion()], 1);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const reread = XLSX.read(buffer, { type: 'buffer' });
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(
      reread.Sheets[reread.SheetNames[0]],
      { header: 1 },
    );
    expect(aoa[0]).toEqual(FORMATO_35_HEADER);
    expect(aoa).toHaveLength(2);
  });
});
