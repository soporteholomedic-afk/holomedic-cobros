/**
 * Domain entities for the cobranza contact directory (REQ-01-DIR-01).
 *
 * The directory persists one `to`/`cc` contact pair per company key in
 * `dbo.EmpresaContactos` (HOLOMEDIC database). The key is the client
 * identifier from the consolidados Excel parse — an 11-digit RUC or an
 * 8-digit DNI. Junk keys (missing names the parser fills with
 * 'CLIENTE SIN NOMBRE', malformed identifiers) MUST NOT be memorized
 * but MUST NOT block sending either; that policy lives here as a pure
 * helper so the client (skip the PUT, send proceeds) and the server
 * (PUT 400, defense in depth) share one definition (design D10).
 */

/**
 * Directory key shape: 11-digit RUC or 8-digit DNI.
 * Shared by the API route validation and `esClaveDirectorioValida`.
 */
export const RUC_PATTERN = /^\d{8,11}$/;

/**
 * The junk razonSocial the Excel parser falls back to when a client
 * row has no name (`excelParser.ts` — exact literal, trimmed).
 * Case variants are REAL names: the parser itself compares with exact
 * post-trim equality, and blocking a case variant would risk blocking
 * a real (oddly cased) company (design OQ2/D2).
 */
export const RAZON_SOCIAL_JUNK = 'CLIENTE SIN NOMBRE';

/**
 * A persisted contact pair for one company key.
 *
 * `updatedAt` is an ISO-8601 string (with milliseconds) — the SQL
 * Server adapter converts `DATETIME2` `Date` objects at the boundary
 * so this contract stays string-based. `emailCopia` and `updatedBy`
 * are nullable columns.
 */
export interface EmpresaContacto {
  ruc: string;
  razonSocial: string;
  emailPrincipal: string;
  emailCopia: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * Upsert input resolved by the API route. The route fills `updatedBy`
 * from the JWT session (`session.nombre.trim() || 'sistema'`,
 * send-results precedent / design OQ1-D1); the repository stamps
 * `updatedAt` app-side at write time, so neither travels on the wire
 * from the client.
 */
export interface SaveContactInput {
  ruc: string;
  razonSocial: string;
  emailPrincipal: string;
  /** Comma-joined cc list or `null` when the operator sent none. */
  emailCopia: string | null;
  updatedBy: string | null;
}

/**
 * Send outcome of a cobranza attempt (REQ-02). Exactly one row per
 * attempt — `SUCCESS` when the SMTP transport accepted the message,
 * `FAILED` otherwise (transport error or unexpected exception).
 */
export type EstadoEnvioCobranza = 'SUCCESS' | 'FAILED';

/**
 * An immutable audit row for one cobranza send attempt, as read back
 * from `dbo.CobranzaEnviosHistorial` (REQ-02).
 *
 * `destinatarios`/`copias` are decoded from the stored JSON array
 * strings at the adapter boundary. `fechaEnvio` is an ISO-8601 UTC
 * string — the SQL Server adapter converts the `DATETIME2(3)` `Date`
 * at the boundary so this contract stays string-based
 * (EmpresaContacto contract precedent). The read model NEVER carries
 * the email body: `cuerpoResumen` (full HTML, NVARCHAR(MAX) off-row)
 * is excluded from `getByRuc` results to keep the history API light.
 */
export interface CobranzaEnvioHistorial {
  id: number;
  ruc: string;
  razonSocial: string | null;
  destinatarios: string[];
  copias: string[] | null;
  asunto: string;
  montoReclamado: number | null;
  moneda: string | null;
  comprobantesCount: number | null;
  estadoEnvio: EstadoEnvioCobranza;
  errorDetalle: string | null;
  enviadoPor: string;
  fechaEnvio: string;
}

/**
 * Write input for one audit row. Same shape as `CobranzaEnvioHistorial`
 * minus `id` (identity, DB-assigned) and `fechaEnvio` (DB-stamped via
 * the `SYSUTCDATETIME()` column default — R7 storage convention).
 *
 * `destinatarios`/`copias` travel as arrays and are JSON-encoded by
 * the adapter; `copias` is `null` when the operator sent no cc list.
 * Optional metadata (`razonSocial`, `montoReclamado`, `moneda`,
 * `comprobantesCount`) is `null` when the payload omitted it
 * (back-compat) — never defaulted or inferred server-side.
 */
export interface RegistroEnvioCobranzaInput {
  ruc: string;
  razonSocial: string | null;
  destinatarios: string[];
  copias: string[] | null;
  asunto: string;
  cuerpoResumen: string | null;
  montoReclamado: number | null;
  moneda: string | null;
  comprobantesCount: number | null;
  estadoEnvio: EstadoEnvioCobranza;
  errorDetalle: string | null;
  enviadoPor: string;
}

/**
 * Whether the `(ruc, razonSocial)` pair may be memorized in the
 * contact directory (REQ-01-DIR-01):
 *  - `ruc.trim()` matches `RUC_PATTERN` (8 or 11 digits), AND
 *  - `razonSocial.trim()` is non-empty, AND
 *  - `razonSocial.trim() !== RAZON_SOCIAL_JUNK` (exact post-trim
 *    equality — the parser's own junk semantics; case variants pass).
 *
 * Invalid keys are skipped client-side (no PUT round-trip, the send
 * still proceeds) and rejected server-side (PUT 400) — never blocked.
 */
export function esClaveDirectorioValida(ruc: string, razonSocial: string): boolean {
  if (!RUC_PATTERN.test(ruc.trim())) return false;
  const nombre = razonSocial.trim();
  return nombre !== '' && nombre !== RAZON_SOCIAL_JUNK;
}
