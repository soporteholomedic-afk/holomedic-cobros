import { describe, it, expect } from 'vitest';
import type { SpResultRow, WorkerRow, CompanyGroup } from '../sp-result';

describe('SpResultRow', () => {
  it('should have all 21 named columns as string/number properties', () => {
    const row: SpResultRow = {
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
    };

    expect(row.NroDId).toBe('DNI 25721424');
    expect(row.Pacien).toBe('FALLA PEÑA GILMER DUBERLY');
    expect(row.DesTCh).toBe('PERIODICO');
    expect(row.DesDes).toBe('UNACEM');
    expect(row.NomCom).toBe('CIME INGENIEROS S R L');
    expect(row.EdaPac).toBe(53);
    expect(row.PesoKg).toBe(79);
    expect(typeof row.IMCkgm).toBe('number');
  });

  it('should allow index signature for future columns', () => {
    const row: SpResultRow = {
      NroDId: 'X',
      Pacien: 'X',
      DesPue: 'X',
      DesDes: 'X',
      SexPac: 'X',
      FecNac: 'X',
      EdaPac: 0,
      NomPro: 'X',
      DesTCh: 'X',
      FecAte: 'X',
      ValHas: 'X',
      NomCli: 'X',
      Condic: 'X',
      EstCar: 'X',
      PesoKg: 0,
      IMCkgm: 0,
      FreAud: 'X',
      CenCos: 'X',
      SelRes: 'X',
      EstPag: 'X',
      NomCom: 'X',
      futureColumn: 'extra data',
      anotherColumn: 42,
    };

    expect(row.futureColumn).toBe('extra data');
    expect(row.anotherColumn).toBe(42);
  });
});

describe('WorkerRow', () => {
  it('should map SP columns to display-friendly names', () => {
    const worker: WorkerRow = {
      nombre: 'FALLA PEÑA GILMER DUBERLY',
      tipoExamen: 'PERIODICO',
      proyecto: 'UNACEM',
    };

    expect(worker.nombre).toBe('FALLA PEÑA GILMER DUBERLY');
    expect(worker.tipoExamen).toBe('PERIODICO');
    expect(worker.proyecto).toBe('UNACEM');
  });

  it('should accept different worker data (triangulation)', () => {
    const worker: WorkerRow = {
      nombre: 'ASTORGA FLORES MARTIN ADRIAN',
      tipoExamen: 'PREOCUPACIONAL',
      proyecto: 'NEXA CAJAMARQUILLA',
    };

    expect(worker.nombre).toBe('ASTORGA FLORES MARTIN ADRIAN');
    expect(worker.tipoExamen).toBe('PREOCUPACIONAL');
    expect(worker.proyecto).toBe('NEXA CAJAMARQUILLA');
  });
});

describe('CompanyGroup', () => {
  it('should group workers by company name', () => {
    const workers: WorkerRow[] = [
      { nombre: 'FALLA PEÑA GILMER DUBERLY', tipoExamen: 'PERIODICO', proyecto: 'UNACEM' },
    ];

    const group: CompanyGroup = {
      companyName: 'CIME INGENIEROS S R L',
      workers,
      workerCount: 1,
    };

    expect(group.companyName).toBe('CIME INGENIEROS S R L');
    expect(group.workers).toHaveLength(1);
    expect(group.workerCount).toBe(1);
    expect(group.workers[0].nombre).toBe('FALLA PEÑA GILMER DUBERLY');
  });

  it('should handle multiple workers in a group (triangulation)', () => {
    const workers: WorkerRow[] = [
      { nombre: 'WORKER A', tipoExamen: 'PERIODICO', proyecto: 'PROJ-A' },
      { nombre: 'WORKER A', tipoExamen: 'ADICIONALES', proyecto: 'ADICIONALES' },
      { nombre: 'WORKER B', tipoExamen: 'PREOCUPACIONAL', proyecto: 'PROJ-B' },
    ];

    const group: CompanyGroup = {
      companyName: 'CHOICE SERVICE S.A.C.',
      workers,
      workerCount: 3,
    };

    expect(group.companyName).toBe('CHOICE SERVICE S.A.C.');
    expect(group.workers).toHaveLength(3);
    expect(group.workerCount).toBe(3);
    // Multi-exam worker: same nombre, different tipoExamen → separate rows
    expect(group.workers[0].nombre).toBe('WORKER A');
    expect(group.workers[1].nombre).toBe('WORKER A');
    expect(group.workers[0].tipoExamen).not.toBe(group.workers[1].tipoExamen);
  });
});
