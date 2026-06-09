import { describe, it, expect } from 'vitest';
import type { SpResultRow } from '@/types/sp-result';
import { groupByCompany } from '../group-by-company';

/**
 * Fixture rows extracted from SQLSERVER/ejemplo_resultados.txt structure.
 * These represent the raw SP_RPT_MATRIZICCGSA output rows.
 */
function makeRow(overrides: Partial<SpResultRow> = {}): SpResultRow {
  return {
    NroDId: 'DNI 25721424',
    Pacien: 'FALLA PEÑA GILMER DUBERLY',
    DesPue: 'SOLDADOR',
    DesDes: 'UNACEM',
    SexPac: 'M',
    FecNac: '15/08/1972',
    EdaPac: 53,
    NomPro: 'P3 - SUSTANCIAS QUIMICAS',
    DesTCh: 'PERIODICO',
    FecAte: '09/06/2026',
    ValHas: '10/06/2027',
    NomCli: 'HOLOMEDIC SERVICIOS INTEGRALES S.A.C.',
    Condic: 'NULL',
    EstCar: 'PENDIENTE',
    PesoKg: 79,
    IMCkgm: 28.67,
    FreAud: '500,1000,2000,3000,4000,6000,8000',
    CenCos: 'CIME INGENIEROS S R L',
    SelRes: 'NULL',
    EstPag: 'CREDITO',
    NomCom: 'CIME INGENIEROS S R L',
    ...overrides,
  };
}

describe('groupByCompany', () => {
  // ---- Empty input ----

  it('should return an empty array when given an empty array', () => {
    const result = groupByCompany([]);
    expect(result).toEqual([]);
  });

  // ---- Single row ----

  it('should create a single group with one worker from a single row', () => {
    const rows = [makeRow()];
    const result = groupByCompany(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      companyName: 'CIME INGENIEROS S R L',
      workerCount: 1,
    });
    expect(result[0].workers).toHaveLength(1);
    expect(result[0].workers[0]).toEqual({
      nombre: 'FALLA PEÑA GILMER DUBERLY',
      tipoExamen: 'PERIODICO',
      proyecto: 'UNACEM',
    });
  });

  // ---- Multiple rows, same company ----

  it('should group multiple rows with the same NomCom into one CompanyGroup', () => {
    const rows = [
      makeRow({ NroDId: 'DNI 11111111', Pacien: 'WORKER A', DesTCh: 'EXAM-1', DesDes: 'PROJ-A' }),
      makeRow({ NroDId: 'DNI 22222222', Pacien: 'WORKER B', DesTCh: 'EXAM-2', DesDes: 'PROJ-A' }),
      // Both belong to CIME INGENIEROS S R L (default NomCom)
    ];
    const result = groupByCompany(rows);

    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('CIME INGENIEROS S R L');
    expect(result[0].workers).toHaveLength(2);
    expect(result[0].workerCount).toBe(2);
    expect(result[0].workers[0].nombre).toBe('WORKER A');
    expect(result[0].workers[1].nombre).toBe('WORKER B');
  });

  // ---- Multiple companies, sorted ----

  it('should return multiple CompanyGroups sorted alphabetically by companyName', () => {
    const rows = [
      makeRow({ NomCom: 'CHOICE SERVICE S.A.C.', NroDId: 'DNI 33333333', Pacien: 'WORKER C', DesTCh: 'PREOCUPACIONAL', DesDes: 'PROJ-C' }),
      makeRow({ NomCom: 'ASCENSORES GS&F S.A.C.', NroDId: 'DNI 44444444', Pacien: 'WORKER D', DesTCh: 'PERIODICO', DesDes: 'PROJ-D' }),
      makeRow({ NomCom: 'CIME INGENIEROS S R L', NroDId: 'DNI 11111111', Pacien: 'WORKER A', DesTCh: 'EXAM-1', DesDes: 'PROJ-A' }),
    ];
    const result = groupByCompany(rows);

    expect(result).toHaveLength(3);
    expect(result[0].companyName).toBe('ASCENSORES GS&F S.A.C.');
    expect(result[1].companyName).toBe('CHOICE SERVICE S.A.C.');
    expect(result[2].companyName).toBe('CIME INGENIEROS S R L');
  });

  // ---- Multi-exam worker (same DNI, same company, different exams → separate WorkerRow) ----

  it('should produce separate WorkerRow entries for the same worker with different exams', () => {
    const rows = [
      makeRow({ NroDId: 'DNI 25558504', Pacien: 'ASTORGA FLORES MARTIN ADRIAN', DesTCh: 'PREOCUPACIONAL', DesDes: 'NEXA CAJAMARQUILLA', NomCom: 'CHOICE SERVICE S.A.C.' }),
      makeRow({ NroDId: 'DNI 25558504', Pacien: 'ASTORGA FLORES MARTIN ADRIAN', DesTCh: 'ADICIONALES', DesDes: 'ADICIONALES', NomCom: 'CHOICE SERVICE S.A.C.' }),
    ];
    const result = groupByCompany(rows);

    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('CHOICE SERVICE S.A.C.');
    expect(result[0].workers).toHaveLength(2);
    expect(result[0].workerCount).toBe(2);

    // Both rows should produce separate entries, not collapsed
    expect(result[0].workers[0]).toEqual({
      nombre: 'ASTORGA FLORES MARTIN ADRIAN',
      tipoExamen: 'PREOCUPACIONAL',
      proyecto: 'NEXA CAJAMARQUILLA',
    });
    expect(result[0].workers[1]).toEqual({
      nombre: 'ASTORGA FLORES MARTIN ADRIAN',
      tipoExamen: 'ADICIONALES',
      proyecto: 'ADICIONALES',
    });
  });

  // ---- Field mapping correctness ----

  it('should correctly map SP columns to WorkerRow display fields', () => {
    const rows = [
      makeRow({
        Pacien: 'JUAN PÉREZ',
        DesTCh: 'RAYOS X',
        DesDes: 'CLÍNICA SANTA ISABEL',
        NomCom: 'EMPRESA TEST',
      }),
    ];
    const result = groupByCompany(rows);

    expect(result[0].workers[0]).toEqual({
      nombre: 'JUAN PÉREZ',
      tipoExamen: 'RAYOS X',
      proyecto: 'CLÍNICA SANTA ISABEL',
    });
  });

  // ---- workerCount matches workers.length ----

  it('should have workerCount equal to workers.length for each group', () => {
    const rows = [
      makeRow({ NroDId: 'DNI A', Pacien: 'A1', NomCom: 'COMPANY X' }),
      makeRow({ NroDId: 'DNI B', Pacien: 'B1', NomCom: 'COMPANY X' }),
      makeRow({ NroDId: 'DNI C', Pacien: 'C1', NomCom: 'COMPANY X' }),
      makeRow({ NroDId: 'DNI D', Pacien: 'D1', NomCom: 'COMPANY Y' }),
    ];
    const result = groupByCompany(rows);

    const companyX = result.find((g) => g.companyName === 'COMPANY X');
    const companyY = result.find((g) => g.companyName === 'COMPANY Y');

    expect(companyX).toBeDefined();
    expect(companyX!.workerCount).toBe(companyX!.workers.length);
    expect(companyX!.workerCount).toBe(3);

    expect(companyY).toBeDefined();
    expect(companyY!.workerCount).toBe(companyY!.workers.length);
    expect(companyY!.workerCount).toBe(1);
  });

  // ---- Null/empty NomCom handling ----

  it('should group rows with empty or missing NomCom under a single group', () => {
    const rows = [
      makeRow({ NomCom: '', NroDId: 'DNI 1', Pacien: 'NOCOMP-A', DesTCh: 'EX1', DesDes: 'P1' }),
      makeRow({ NomCom: '   ', NroDId: 'DNI 2', Pacien: 'NOCOMP-B', DesTCh: 'EX2', DesDes: 'P2' }),
      makeRow({ NomCom: 'VALID COMPANY', NroDId: 'DNI 3', Pacien: 'VALID-A', DesTCh: 'EX3', DesDes: 'P3' }),
    ];
    const result = groupByCompany(rows);

    // Empty/blank NomCom should be grouped together, separate from valid ones
    expect(result).toHaveLength(2);

    const noCompany = result.find((g) => g.companyName === '');
    expect(noCompany).toBeDefined();
    expect(noCompany!.workerCount).toBe(2);

    const validCompany = result.find((g) => g.companyName === 'VALID COMPANY');
    expect(validCompany).toBeDefined();
    expect(validCompany!.workerCount).toBe(1);
  });
});
