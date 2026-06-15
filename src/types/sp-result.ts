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
 * A single entry within a UnifiedPerson, representing either:
 * - An order row from SP_SEL_ORDEN (idAten/nroRuc/nomCFa populated, proyecto may be empty), or
 * - An additional worker row from SP_RPT_MATRIZICCGSA with a distinct DesDes
 *   (proyecto populated, order fields empty).
 *
 * When fichas.length > 1, the component renders a chevron-based expandable sub-row.
 */
export interface UnifiedFicha {
  idAten: string;
  nroRuc: string;
  nomCFa: string;
  /** SpResultRow.DesDes for worker-sourced fichas; '' for order-sourced fichas. */
  proyecto: string;
  /** SpResultRow.DesTCh for worker-sourced fichas; '' for order-sourced fichas. */
  tipoExamen: string;
  /**
   * SpResultRow.Condic (medical-fitness verdict) **pre-normalized** at the hook layer.
   * The value is NEVER the raw SP string: by the time it reaches the UI, the hook
   * has already applied `normalizeCondic` (see `src/lib/condic.ts`). That means:
   *   - literal `'NULL'` / `'null'` / `'Null'` are mapped to `''`
   *   - whitespace-only strings are mapped to `''`
   *   - otherwise the value is `value.trim()`
   * Consumers can render `''` as em-dash without re-normalizing.
   */
  condic: string;
}

/**
 * Unified person row formed by merging worker exam data (SP_RPT_MATRIZICCGSA)
 * with patient order data (SP_SEL_ORDEN) using normalized DNI as the correlation key.
 *
 * FULL OUTER JOIN semantics: worker-only and order-only persons both included.
 * Missing fields from the absent side remain empty strings.
 *
 * When a DNI appears in multiple worker rows (same person, different DesDes),
 * each additional occurrence is stored as a UnifiedFicha with proyecto set and
 * order fields empty, so the UI can expand them as sub-rows.
 */
export interface UnifiedPerson {
  dni: string;              // normalized DNI (bare digits, no prefix/whitespace)
  nombre: string;           // SpResultRow.Pacien  (first occurrence)
  empresa: string;          // SpResultRow.NomCom  (first occurrence)
  tipoExamen: string;       // SpResultRow.DesTCh  (first occurrence)
  proyecto: string;         // SpResultRow.DesDes  (first occurrence)
  /**
   * Pre-normalized medical-fitness verdict for the primary ficha; `''` when none.
   * Mirrors the normalization contract documented on `UnifiedFicha.condic`.
   */
  condic: string;
  fichas: UnifiedFicha[];   // order entries + extra worker rows with distinct DesDes
}
