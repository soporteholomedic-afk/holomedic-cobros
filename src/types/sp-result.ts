/**
 * Raw row from SP_RPT_MATRIZICCGSA execution.
 * Contains all 21 named columns from the stored procedure result set.
 * Index signature allows forward-compatibility with future columns.
 */
export interface SpResultRow {
  NroDId: string;
  Pacien: string;
  DesPue: string;
  DesDes: string;
  SexPac: string;
  FecNac: string;
  EdaPac: number;
  NomPro: string;
  DesTCh: string;
  FecAte: string;
  ValHas: string;
  NomCli: string;
  Condic: string;
  EstCar: string;
  PesoKg: number;
  IMCkgm: number;
  FreAud: string;
  CenCos: string;
  SelRes: string;
  EstPag: string;
  NomCom: string;
  [key: string]: unknown;
}

/**
 * Display-friendly representation of a single worker examination.
 * Maps: Pacien → nombre, DesTCh → tipoExamen, DesDes → proyecto
 */
export interface WorkerRow {
  nombre: string;
  tipoExamen: string;
  proyecto: string;
}

/**
 * Group of workers belonging to a single company.
 * companyName maps from NomCom column.
 */
export interface CompanyGroup {
  companyName: string;
  workers: WorkerRow[];
  workerCount: number;
}

/**
 * Raw row from SP_SEL_ORDEN execution.
 * Named columns consumed by the patient/work-order UI (Ficha, RUT, Razón Social, DNI).
 * Index signature allows forward-compatibility with the full result set.
 */
export interface OrderRow {
  IdAten: string;
  NroRuc: string;
  NomCFa: string;
  NroDId: string;
  [key: string]: unknown;
}

/**
 * Alternate patient/work-order entry within a UnifiedPerson.
 * Represents a single matched row from SP_SEL_ORDEN.
 * When fichas.length > 1, the component renders a chevron-based expandable sub-row.
 */
export interface UnifiedFicha {
  idAten: string;
  nroRuc: string;
  nomCFa: string;
}

/**
 * Unified person row formed by merging worker exam data (SP_RPT_MATRIZICCGSA)
 * with patient order data (SP_SEL_ORDEN) using normalized DNI as the correlation key.
 *
 * FULL OUTER JOIN semantics: worker-only and order-only persons both included.
 * Missing fields from the absent side remain empty strings.
 */
export interface UnifiedPerson {
  dni: string;              // normalized DNI (bare digits, no prefix/whitespace)
  nombre: string;           // SpResultRow.Pacien
  empresa: string;          // SpResultRow.NomCom
  tipoExamen: string;       // SpResultRow.DesTCh
  proyecto: string;         // SpResultRow.DesDes
  fichas: UnifiedFicha[];   // matched order entries; empty when worker-only
}
