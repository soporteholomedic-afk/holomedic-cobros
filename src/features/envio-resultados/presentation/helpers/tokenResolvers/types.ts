/**
 * Type definitions for the interpolation registry (PR 4).
 *
 * `interpolateSpitch` is refactored to a `TokenResolverRegistry` (this
 * module) plus an `InterpolationContext` (the caller's data). The
 * non-empty token path is string-based (behaviour-preserving with the
 * previous `interpolateSpitch`). Empty tokens trigger client-side
 * `DOMParser` block removal — see `removeEmptyBlocks` in `interpolateSpitch.ts`.
 *
 * The factory `buildTokenResolverRegistry(area)` is the only thing
 * `interpolateSpitch` calls. Tests can construct a fake registry to
 * exercise the orchestration without touching any real area data.
 *
 * Spec: `envio-resultados` MODIFIED delta — "TokenResolverRegistry and
 * InterpolationContext" + "New tokens firma and tabla".
 */

import type { Patient, PatientFile } from '../../../domain/entities';

/**
 * One row of the cobranza `documentosPendientes` table. All fields are
 * PRE-FORMATTED strings — the client formats numbers with their own
 * currency (multi-currency per row, REQ-01-DIR-06); the resolvers stay
 * dumb escape-and-emit.
 */
export interface DocumentoPendienteRow {
  fecha: string;
  factura: string;
  monto: string;
  saldo: string;
}

/**
 * One row of the cobranza `tabla-cobranza` table. All 12 fields are
 * PRE-FORMATTED strings — amounts carry their own row currency
 * (`formatWithCurrency(doc.moneda, v)` upstream, es-PE 2-decimals; zero
 * renders as e.g. `'S/ 0.00'`, never blank), dates are verbatim
 * DD/MM/YYYY, `diasVencidos` is the row's overdue-day count (`'0'` when
 * not past due); the resolver stays a dumb escape-and-emit renderer.
 */
export interface TablaCobranzaRow {
  cliente: string;
  razonSocial: string;
  tipoDoc: string;
  serie: string;
  numero: string;
  fechaDoc: string;
  fechaVen: string;
  moneda: string;
  debe: string;
  haber: string;
  saldo: string;
  diasVencidos: string;
}

/**
 * The interpolation data passed by the send flow (`EmailEditor.handleSpitchSelect`).
 *
 * `today` is injectable — fixes the module-level `TODAY` gotcha the
 * previous `interpolateSpitch` had (frozen at import time, untestable).
 * Spec scenario: "Injectable today fixes date bug".
 */
export interface InterpolationContext {
  companyName: string;
  patientNames: string[];
  fileNames: string[];
  /** Signature HTML. The `{{firma}}` resolver returns this verbatim. */
  firma: string;
  /** Full patient data so table resolvers can read fields beyond `name`. */
  patients: Patient[];
  /** Full file data so table resolvers can read fields beyond `name`. */
  files: PatientFile[];
  /** Which area owns the template (e.g. `'consolidados'`). */
  area: string;
  /** Injectable ISO or localised date string. No `new Date()` inside the registry. */
  today: string;
  /**
   * Proyecto / Destino of the first selected patient/ficha
   * (`ficha?.proyecto ?? person.proyecto ?? ''` upstream). The
   * `{{destino}}` resolver returns it HTML-escaped for the body and
   * raw for the subject. Empty string signals "missing destination".
   */
  destino: string;
  // ---- OPTIONAL cobranza fields (REQ-01 D12 widening, back-compat) ----
  // Only the cobranza flow fills these. All values are pre-formatted
  // strings; consolidados callers keep constructing the context without
  // them, exactly as before the widening.
  /** Cobranza: client RUC / DNI key. */
  ruc?: string;
  /** Cobranza: pre-formatted main-currency total (e.g. 'S/ 12,345.67'). */
  montoTotal?: string;
  /** Cobranza: main currency code (e.g. 'PEN'). */
  moneda?: string;
  /** Cobranza: days of the oldest overdue document. */
  diasVencidos?: string;
  /** Cobranza: institutional bank-accounts HTML ({{cuentasBancarias}} source). */
  cuentasBancariasHtml?: string;
  /** Cobranza: pending-document rows for the `documentosPendientes` table. */
  documentosPendientes?: DocumentoPendienteRow[];
  /** Cobranza: full rows for the `tabla-cobranza` table (12 pre-formatted fields). */
  tablaCobranza?: TablaCobranzaRow[];
}

/**
 * The result of resolving a token — split into HTML-safe and plain-text
 * values so the orchestrator can apply different values to the body
 * (HTML context) vs the subject (plain-text context).
 *
 * - `html` is HTML-escaped (safe for `dangerouslySetInnerHTML`).
 * - `subject` is raw (never appears inside HTML; React escapes it when
 *   rendering `{subject}` in JSX text nodes or `<input value={subject}>`).
 *
 * Both fields default to `''` to signal "empty" — the orchestrator
 * removes the containing block from the body when `html === ''`.
 */
export interface ResolveResult {
  html: string;
  subject: string;
}

/**
 * A resolver for a single non-table token. Returns a `ResolveResult`
 * to provide differentiated HTML-safe and plain-text values.
 * Return `{ html: '', subject: '' }` to signal "empty".
 */
export interface TokenResolver {
  /** The placeholder key WITHOUT the `{{}}` braces. E.g. `'empresa'`. */
  key: string;
  resolve(ctx: InterpolationContext): ResolveResult;
}

/**
 * A resolver for a `{{tabla:name:cols}}` token. Returns a fully-rendered
 * HTML `<table>` containing ONLY the selected columns. Empty result
 * (`''`) triggers block removal.
 */
export interface TableResolver {
  /** The `name` segment of `{{tabla:NAME:cols}}`. E.g. `'documentosVencidos'`. */
  name: string;
  resolve(cols: string[], ctx: InterpolationContext): string;
}

/**
 * The orchestrator consumed by `interpolate(html, subject, ctx, registry)`.
 *
 * Unknown tokens resolve to the empty string (so they trigger the
 * empty-block removal path). This matches the prior behaviour: any
 * non-listed `{{token}}` was left in the output as `''` after the
 * string-replace loop, so the orchestrator now does the same thing in
 * one consistent path.
 */
export interface TokenResolverRegistry {
  /** Resolve a simple `{{key}}` token. Returns `{ html: '', subject: '' }` if unknown or empty. */
  resolveToken(key: string, ctx: InterpolationContext): ResolveResult;
  /** Resolve a `{{tabla:name:cols}}` token. Returns `{ html: '', subject: '' }` if unknown or empty. */
  resolveTable(name: string, cols: string[], ctx: InterpolationContext): ResolveResult;
}
