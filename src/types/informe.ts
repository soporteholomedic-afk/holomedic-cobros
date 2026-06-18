/**
 * Types and contracts for the "Generar archivos" tab in `FilesModal`.
 *
 * The data flows:
 *
 *   SP_SEL_INFORMESNOCERRADOS  ->  InformeNoCerradoRow  (lookup)
 *   SP_SEL_PLANTILLAMEDICAXCLIENTE  ->  PlantillaRow[]  (plantillas)
 *   POST /generar             ->  GenerarPdfResponse  (CLI invocation)
 *
 * Row shapes are the camelCase wire contract used across the Next.js
 * boundary. The actual SP column names (PascalCase) are mapped at the
 * route layer so the rest of the app sees consistent JS-style keys.
 *
 * The `[k: string]: unknown` index signature keeps the interface
 * forward-compatible: the SPs may add columns in the future and the
 * client can still consume the response without a type update.
 */

export interface InformeNoCerradoRow {
  idAten: string;
  codEmp: number;
  codSed: number;
  codTCl: number;
  numOrd: number;
  fecAte: string;
  codCli: number | null;
  codDCo: number | null;
  [key: string]: unknown;
}

export interface PlantillaRow {
  codPMe: number;
  arcPla: string;
  ordPri: number;
  idePMe: number;
  ideFMe: number | null;
  [key: string]: unknown;
}

export interface GenerarPdfRequest {
  idAten: string;
  codEmp: number;
  codSed: number;
  codTCl: number;
  numOrd: number;
  codCli: number;
  emiAfi: number;
  incExp: number;
  codDCo?: number | null;
  /**
   * Patient's RUC. Required because `OutputDir` is composed as
   * `\\<UNC>\\<ruc>\\<dni>\\<idAten>\\LEGAJOS` (see proposal §"Out of
   * Scope" and design decision #6). The spec body schema omits it;
   * the route enforces its presence and returns 400 when missing.
   */
  ruc: string;
  /** Patient's DNI (digits only). Required for the same reason as `ruc`. */
  dni: string;
  user: string;
  pass: string;
  strict?: boolean;
  idePmeList: number[];
}

export type ManifestRowStatus = 'success' | 'skipped' | 'failed' | 'error';

export interface ManifestRow {
  idePMe: number;
  arcPla?: string;
  file?: string;
  status: ManifestRowStatus;
  reason?: string;
}

export interface GenerarPdfSummary {
  generated: number;
  failed: number;
  skipped: number;
  exitCode: number;
}

export interface GenerarPdfResponse {
  manifest: ManifestRow[];
  summary: GenerarPdfSummary;
}
