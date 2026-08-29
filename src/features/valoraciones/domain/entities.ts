/**
 * Valoraciones domain entities (REQ-03).
 *
 * `RepFacturacion` mirrors the reader-consumed columns of
 * `SP_RPT_REPFACTURACION` (verified against the SP source — see
 * `openspec/changes/REQ-03-valorizaciones-sigla/smoke-test-findings.md`).
 * Casing is EXACT on purpose: `FecSTA`, `VImpMN/MO`, `VVtaMN/MO`, `CodiEM`.
 * The SP's `SELECT *` also returns internal columns (`Identi`, `CodEmp`,
 * `CodSed`, `CodTCl`, `NumOrd`, `NumSSe`) that the mapper ignores.
 *
 * Dates cross the boundary as ISO-8601 strings (repository mapper
 * converts the mssql `Date` objects); the UI renders `dd/MM/yyyy`.
 */
export interface RepFacturacion {
  NomCFa: string;
  NomCom: string;
  DesDes: string;
  CenCos: string;
  NroDId: string;
  Pacien: string;
  EdaPac: number;
  FecNac: string | null;
  DesPue: string;
  DsTiTr: string;
  FecAte: string;
  FecSTA: string | null;
  DesTCh: string;
  NomPro: string;
  Result: string;
  Anex7D: string;
  CodMon: number;
  DesMon: string;
  Simbol: string;
  VImpMN: number;
  VImpMO: number;
  VVtaMN: number;
  VVtaMO: number;
  Solici: string;
  Admini: string;
  IdAten: string;
  ItemEx: number;
  TipDov: string;
  NumDov: number | null;
  EstCob: EstadoEmpresa;
  NomCli: string;
  IndCon: boolean;
  IdConv: string;
  CodSeC: number | null;
  NumCob: number | null;
  NroVal: string;
  NroOPe: string;
  CodiEM: string;
  FecRec: string | null;
}

/** Business estado for the detail table's Estado column (mapped from SP codes; '—' = NULL/''/unknown). */
export type EstadoEmpresa = 'PAGO CONFORME' | 'PAGO POR CONFIRMAR' | 'CREDITO' | '—';

/** Currency codes mirroring SIGLA's `Tbl_Moneda` (verified). */
export type CodigoMoneda = 1 | 2;

export const MONEDAS: Record<CodigoMoneda, { descripcion: string; simbol: string }> = {
  1: { descripcion: 'SOLES', simbol: 's/.' },
  2: { descripcion: 'DOLARES', simbol: '$' },
};

/**
 * The 11 REQ-03 §2 filters. `fecIni`/`fecFin` are required `YYYY-MM-DD`;
 * the repository derives `00:00:00`/`23:59:59` bounds. `indFac` is a
 * tri-state mirroring SIGLA's combo: `null` = Todos, `1` = Facturados,
 * `0` = No Facturados (the valorizaciones default). Optional numeric
 * ids absent or `<= 0` are sent to the SP as NULL.
 */
export interface ValoracionesFilter {
  fecIni: string;
  fecFin: string;
  codMon: CodigoMoneda;
  indFac: 0 | 1 | null;
  inFsta: boolean;
  codCli?: number;
  codCfa?: number;
  codDes?: number;
  codPac?: number;
  codSed?: number;
  tipTra?: number;
}

// ---- Lookup item types (design D3) ----

export interface ClienteLookupItem {
  codCli: number;
  nomCom: string;
  nroRuc: string | null;
}

export interface PacienteLookupItem {
  codPac: number;
  nombre: string;
}

export interface DestinoLookupItem {
  codDes: number;
  desDes: string;
}

export interface TipoTrabajadorItem {
  codTip: number;
  desTip: string;
}

export interface SedeLookupItem {
  codSed: number;
  nomSed: string;
}

// ---- Grouping (detail table) ----

/**
 * A company group for the results table: rows grouped by facturar-a
 * (`NomCFa`, falling back to `NomCli`), with moneda-aware subtotal
 * (Σ `VVtaMN`/`VVtaMO` per `codMon`), 18% IGV and total — all `round2`.
 */
export interface EmpresaGrupo {
  empresa: string;
  rows: RepFacturacion[];
  cantidad: number;
  subtotal: number;
  igv: number;
  total: number;
  simbol: string;
}
