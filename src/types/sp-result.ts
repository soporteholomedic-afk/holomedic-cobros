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
