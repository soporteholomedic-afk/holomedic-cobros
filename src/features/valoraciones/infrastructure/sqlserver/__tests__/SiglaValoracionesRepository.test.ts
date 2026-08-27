import { describe, it, expect, vi, beforeEach } from 'vitest';
import mssql from 'mssql';

import { SiglaValoracionesRepository, REPFACTURACION_BINDS } from '../SiglaValoracionesRepository';
import type { ValoracionesFilter } from '../../../domain/entities';

interface RecordedInput {
  name: string;
  type: unknown;
  value: unknown;
}

interface FakePool {
  pool: { request: () => unknown };
  request: {
    input: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  };
  inputs: RecordedInput[];
}

function createFakePool(recordset: unknown[] = []): FakePool {
  const inputs: RecordedInput[] = [];
  const request = {
    input: vi.fn((name: string, type: unknown, value: unknown) => {
      inputs.push({ name, type, value });
      return request;
    }),
    execute: vi.fn().mockResolvedValue({ recordset }),
    query: vi.fn().mockResolvedValue({ recordset }),
  };
  return {
    pool: { request: vi.fn(() => request) },
    request,
    inputs,
  };
}

function inputValue(fake: FakePool, name: string): unknown {
  const found = fake.inputs.find((i) => i.name === name);
  if (!found) throw new Error(`bind ${name} not recorded`);
  return found.value;
}

const baseFilter: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

describe('REPFACTURACION_BINDS — smoke-verified names (no p prefix)', () => {
  it('freezes the verified parameter names and types', () => {
    expect(REPFACTURACION_BINDS.fecIni.param).toBe('FecIni');
    expect(REPFACTURACION_BINDS.fecFin.param).toBe('FecFin');
    expect(REPFACTURACION_BINDS.codCli.param).toBe('CodCli');
    expect(REPFACTURACION_BINDS.codCfa.param).toBe('CodCFa');
    expect(REPFACTURACION_BINDS.codDes.param).toBe('CodDes');
    expect(REPFACTURACION_BINDS.codPac.param).toBe('CodPac');
    expect(REPFACTURACION_BINDS.codSed.param).toBe('CodSed');
    expect(REPFACTURACION_BINDS.indFac.param).toBe('IndFac');
    expect(REPFACTURACION_BINDS.tipTra.param).toBe('TipTra');
    expect(REPFACTURACION_BINDS.codMon.param).toBe('CodMon');
    expect(REPFACTURACION_BINDS.inFsta.param).toBe('InFSTA');

    expect(REPFACTURACION_BINDS.indFac.type).toBe(mssql.Bit);
    expect(REPFACTURACION_BINDS.inFsta.type).toBe(mssql.Bit);
    expect(REPFACTURACION_BINDS.fecIni.type).toBe(mssql.DateTime);
    expect(REPFACTURACION_BINDS.codMon.type).toBe(mssql.Int);
  });
});

describe('SiglaValoracionesRepository.buscarValoraciones', () => {
  let repo: SiglaValoracionesRepository;

  beforeEach(() => {
    repo = new SiglaValoracionesRepository({} as mssql.ConnectionPool);
  });

  it('executes SP_RPT_REPFACTURACION with typed binds and 00:00:00/23:59:59 bounds', async () => {
    const fake = createFakePool([]);
    repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    await repo.buscarValoraciones({
      ...baseFilter,
      codCli: 7,
      codSed: 3,
      tipTra: 620001,
    });

    expect(fake.request.execute).toHaveBeenCalledWith('SP_RPT_REPFACTURACION');
    expect(inputValue(fake, 'FecIni')).toEqual(new Date('2026-01-01T00:00:00'));
    expect(inputValue(fake, 'FecFin')).toEqual(new Date('2026-01-31T23:59:59'));
    expect(inputValue(fake, 'CodCli')).toBe(7);
    expect(inputValue(fake, 'CodSed')).toBe(3);
    expect(inputValue(fake, 'TipTra')).toBe(620001);
    expect(inputValue(fake, 'CodMon')).toBe(1);
    // tri-state default 0 (No Facturados) travels as BIT false
    expect(inputValue(fake, 'IndFac')).toBe(false);
    expect(inputValue(fake, 'InFSTA')).toBe(false);
    // absent optional ids become NULL binds
    expect(inputValue(fake, 'CodCFa')).toBeNull();
    expect(inputValue(fake, 'CodDes')).toBeNull();
    expect(inputValue(fake, 'CodPac')).toBeNull();
  });

  it('binds <=0 numeric ids as NULL and indFac null as NULL (Todos)', async () => {
    const fake = createFakePool([]);
    repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    await repo.buscarValoraciones({
      ...baseFilter,
      codCli: 0,
      codCfa: -3,
      indFac: null,
      inFsta: true,
      codMon: 2,
    });

    expect(inputValue(fake, 'CodCli')).toBeNull();
    expect(inputValue(fake, 'CodCFa')).toBeNull();
    expect(inputValue(fake, 'IndFac')).toBeNull();
    expect(inputValue(fake, 'InFSTA')).toBe(true);
    expect(inputValue(fake, 'CodMon')).toBe(2);
  });

  it('maps fake SP rows to entities: exact casing, ISO dates, NULL FecSTA', async () => {
    const fecAte = new Date('2026-01-15T00:00:00');
    const fecSTA = new Date('2026-01-17T00:00:00');
    const fake = createFakePool([
      {
        Identi: 1,
        NomCFa: 'EMPRESA A',
        NomCom: 'EMPRESA A',
        DesDes: 'OFICINA',
        CenCos: 'CC1',
        NroDId: 'DNI 12345678',
        Pacien: 'PACIENTE UNO',
        EdaPac: 30,
        FecNac: null,
        DesPue: 'OBRERO',
        DsTiTr: 'OBRERO',
        FecAte: fecAte,
        FecSTA: null,
        DesTCh: 'PREOCUPACIONAL',
        NomPro: 'PROY',
        Result: 'APTO',
        Anex7D: 'S',
        CodMon: 1,
        DesMon: 'SOLES',
        Simbol: 's/.',
        VImpMN: 118,
        VImpMO: 0,
        VVtaMN: 100.5,
        VVtaMO: 0,
        Solici: 'SOL',
        Admini: 'ADM',
        IdAten: '0001',
        ItemEx: 1,
        TipDov: 'FT',
        NumDov: null,
        EstCob: 'P',
        NomCli: 'EMPRESA A',
        IndCon: true,
        IdConv: 'C1',
        CodSeC: null,
        NumCob: null,
        NroVal: 'V1',
        NroOPe: 'O1',
        CodiEM: 'EM1',
        FecRec: null,
        CodEmp: 1,
        CodSed: 1,
        CodTCl: 1,
        NumOrd: 10,
        NumSSe: 2,
      },
      {
        NomCFa: 'EMPRESA B',
        NomCom: 'EMPRESA B',
        DesDes: 'OFICINA',
        CenCos: 'CC2',
        NroDId: 'DNI 87654321',
        Pacien: 'PACIENTE DOS',
        EdaPac: 41,
        FecNac: new Date('1985-05-05T00:00:00'),
        DesPue: 'ANALISTA',
        DsTiTr: 'EMPLEADO',
        FecAte: fecAte,
        FecSTA: fecSTA,
        DesTCh: 'PREOCUPACIONAL',
        NomPro: 'PROY',
        Result: 'APTO',
        Anex7D: 'N',
        CodMon: 1,
        DesMon: 'SOLES',
        Simbol: 's/.',
        VImpMN: 59,
        VImpMO: 0,
        VVtaMN: 50.25,
        VVtaMO: 0,
        Solici: 'SOL',
        Admini: 'ADM',
        IdAten: '0002',
        ItemEx: 2,
        TipDov: 'FT',
        NumDov: 99,
        EstCob: 'C',
        NomCli: 'EMPRESA B',
        IndCon: false,
        IdConv: 'C2',
        CodSeC: 1,
        NumCob: 5,
        NroVal: 'V2',
        NroOPe: 'O2',
        CodiEM: 'EM2',
        FecRec: new Date('2026-02-01T00:00:00'),
      },
    ]);
    repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const rows = await repo.buscarValoraciones(baseFilter);

    expect(rows).toHaveLength(2);
    const [a, b] = rows;
    // Exact casing preserved end-to-end
    expect(a).toMatchObject({
      NomCFa: 'EMPRESA A',
      FecSTA: null,
      FecNac: null,
      FecRec: null,
      NumDov: null,
      CodSeC: null,
      VVtaMN: 100.5,
      CodiEM: 'EM1',
    });
    // Dates cross the boundary as ISO strings (computed, not hardcoded:
    // local-midnight Date objects render in UTC via toISOString).
    expect(a.FecAte).toBe(fecAte.toISOString());
    expect(b.FecSTA).toBe(fecSTA.toISOString());
    expect(b.FecNac).toBe(new Date('1985-05-05T00:00:00').toISOString());
    expect(b.FecRec).toBe(new Date('2026-02-01T00:00:00').toISOString());
    expect(b.IndCon).toBe(false);
  });
});

describe('SiglaValoracionesRepository lookups', () => {
  it('buscarClientes queries Cliente by name/RUC with an escaped LIKE pattern', async () => {
    const fake = createFakePool([
      { CodCli: 1, NomCom: '  EMPRESA A ', NroRuc: '20511165181' },
      { CodCli: 2, NomCom: 'EMPRESA B', NroRuc: null },
    ]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const clientes = await repo.buscarClientes('JUAN');

    expect(fake.request.query).toHaveBeenCalledWith(expect.stringContaining('FROM Cliente'));
    expect(inputValue(fake, 'pat')).toBe('%JUAN%');
    expect(clientes).toEqual([
      { codCli: 1, nomCom: 'EMPRESA A', nroRuc: '20511165181' },
      { codCli: 2, nomCom: 'EMPRESA B', nroRuc: null },
    ]);
  });

  it('escapes LIKE wildcards % _ [ so wildcard-only q cannot match everything', async () => {
    const fake = createFakePool([]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    await repo.buscarClientes('%_[');

    expect(inputValue(fake, 'pat')).toBe('%[%][_][[]%');
  });

  it('buscarPacientes queries Persona (IndPac = 1) and maps {codPac, nombre}', async () => {
    const fake = createFakePool([{ CodPer: 10000001, NroDId: '46145583', Nombre: 'CANCINO CUEVA NOELIA' }]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const pacientes = await repo.buscarPacientes('CANCINO');

    expect(fake.request.query).toHaveBeenCalledWith(expect.stringContaining('FROM Persona'));
    expect(inputValue(fake, 'pat')).toBe('%CANCINO%');
    expect(pacientes).toEqual([{ codPac: 10000001, nombre: 'CANCINO CUEVA NOELIA' }]);
  });

  it('buscarDestinos queries Destino by client with IndReg = 1', async () => {
    const fake = createFakePool([{ CodDes: 1657, DesDes: 'ADICIONALES' }]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const destinos = await repo.buscarDestinos(1);

    expect(fake.request.query).toHaveBeenCalledWith(expect.stringContaining('FROM Destino'));
    expect(inputValue(fake, 'codCli')).toBe(1);
    expect(destinos).toEqual([{ codDes: 1657, desDes: 'ADICIONALES' }]);
  });

  it('buscarTiposTrabajador maps the CodTCo = 62 constants', async () => {
    const fake = createFakePool([
      { CodCon: 620001, DesCon: 'OBRERO' },
      { CodCon: 620002, DesCon: 'EMPLEADO' },
    ]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const tipos = await repo.buscarTiposTrabajador();

    expect(fake.request.query).toHaveBeenCalledWith(expect.stringContaining('CodTCo = 62'));
    expect(tipos).toEqual([
      { codTip: 620001, desTip: 'OBRERO' },
      { codTip: 620002, desTip: 'EMPLEADO' },
    ]);
  });

  it('buscarTiposTrabajador falls back to the hardcoded pair when the query fails (D7)', async () => {
    const fake = createFakePool([]);
    fake.request.query.mockRejectedValueOnce(new Error('SELECT permission denied on Constante'));
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const tipos = await repo.buscarTiposTrabajador();

    expect(tipos).toEqual([
      { codTip: 620001, desTip: 'OBRERO' },
      { codTip: 620002, desTip: 'EMPLEADO' },
    ]);
  });

  it('buscarSedes queries VW_SEDE (IndReg = 1) instead of SP_SEL_SEDE', async () => {
    const fake = createFakePool([{ CodSed: 1, NomSed: 'SEDE SURQUILLO' }]);
    const repo = new SiglaValoracionesRepository(fake.pool as mssql.ConnectionPool);

    const sedes = await repo.buscarSedes();

    const sql = fake.request.query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM VW_SEDE');
    expect(sql).toContain('IndReg = 1');
    expect(fake.request.execute).not.toHaveBeenCalled();
    expect(sedes).toEqual([{ codSed: 1, nomSed: 'SEDE SURQUILLO' }]);
  });
});
