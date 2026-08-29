import type { RepFacturacion } from './entities';

/**
 * Test/preview fixture factory for `RepFacturacion`. Defaults reflect a
 * typical SOLES atención row; override per-test with a `Partial`.
 */
export function makeRepFacturacion(
  overrides: Partial<RepFacturacion> = {},
): RepFacturacion {
  return {
    NomCFa: 'EMPRESA DEMO S.A.C.',
    NomCom: 'EMPRESA DEMO S.A.C.',
    DesDes: 'OFICINA PRINCIPAL',
    CenCos: 'CC-001',
    NroDId: 'DNI 46145583',
    Pacien: 'CANCINO CUEVA NOELIA ISABEL',
    EdaPac: 34,
    FecNac: '1992-03-14T00:00:00.000Z',
    DesPue: 'ANALISTA',
    DsTiTr: 'EMPLEADO',
    FecAte: '2026-08-20T00:00:00.000Z',
    FecSTA: '2026-08-22T00:00:00.000Z',
    DesTCh: 'PREOCUPACIONAL',
    NomPro: 'PROYECTO DEMO',
    Result: 'APTO',
    Anex7D: 'S',
    CodMon: 1,
    DesMon: 'SOLES',
    Simbol: 's/.',
    VImpMN: 118,
    VImpMO: 0,
    VVtaMN: 100,
    VVtaMO: 0,
    Solici: 'SOLICITANTE DEMO',
    Admini: 'ADMIN DEMO',
    IdAten: '000123',
    ItemEx: 1,
    TipDov: 'FT',
    NumDov: 45678,
    EstCob: 'CREDITO',
    NomCli: 'EMPRESA DEMO S.A.C.',
    IndCon: true,
    IdConv: 'C-001',
    CodSeC: 1,
    NumCob: 1234,
    NroVal: 'V0001',
    NroOPe: 'O0001',
    CodiEM: 'EM01',
    FecRec: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}
