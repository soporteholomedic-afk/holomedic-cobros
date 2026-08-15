/**
 * `interpolateSpitch` — thin wrapper around the new `interpolate` orchestrator
 * (PR 4 — design Decisions i, j).
 *
 * Backwards-compatible signature for `EmailEditor.handleSpitchSelect` and
 * its tests. Internally:
 *   1. Builds a `TokenResolverRegistry` for the area.
 *   2. Constructs an `InterpolationContext` with the caller's data and
 *      `today` derived from the current date (the legacy default).
 *   3. Calls `interpolate(html, subject, ctx, registry)`.
 *
 * Spec delta `envio-resultados` MODIFIED: "TokenResolverRegistry and
 * InterpolationContext" + "New tokens firma and tabla".
 *
 * The `today` field was a module-level frozen constant before — it is
 * now per-call. This makes the function testable and removes the
 * gotcha that "two calls in the same session" would see the same date
 * (the legacy code froze `TODAY` at import time).
 *
 * Supported placeholders (per registry):
 *   {{empresa}}        → company name (HTML-escaped)
 *   {{fecha}}          → ctx.today (current date in es-PE format)
 *   {{fechaExamen}}    → ctx.today
 *   {{paciente}}       → first patient's name (HTML-escaped)
 *   {{totalPacientes}} → count of selected patients
 *   {{totalExamenes}}  → total file count across all selected patients
 *   {{listaPacientes}} → <li> list of patient names
 *   {{listaArchivos}}  → <li> list of file names
 *   {{firma}}          → signature HTML (was not present before; new in PR 4)
 *   {{destino}}        → first patient/ficha's Proyecto / Destino
 *                        (HTML-escaped in the body, raw in the subject;
 *                        empty removes its containing block)
 *   {{tabla:NAME:COL1,COL2}} → full HTML <table> for NAME with only the
 *                              selected columns. Names: documentosVencidos,
 *                              examenes. (was not present before; new in PR 4)
 *
 * Empty tokens trigger client-side `DOMParser` block removal
 * (Decision i). `td`/`th` are kept (empty cell).
 */

import { interpolate as interpolateCore } from './interpolate';
import { buildTokenResolverRegistry } from './tokenResolvers/buildTokenResolverRegistry';
import type { InterpolationContext } from './tokenResolvers/types';
import type { Patient, PatientFile } from '../../domain/entities';

export interface InterpolateSpitchParams {
  html: string;
  subject: string;
  companyName: string;
  patientNames: string[];
  fileNames: string[];
  /**
   * Optional override for the interpolation `today`. When omitted the
   * wrapper derives it from `new Date()` (es-PE long format) — matches
   * the legacy default. Tests inject a fixed string to remove time
   * nondeterminism.
   */
  today?: string;
  /**
   * Area identifier — used to pick the right token resolver set. When
   * omitted defaults to `'consolidados'` (the only registered area in
   * v1). Spec delta "TokenResolverRegistry and InterpolationContext"
   * passes the area explicitly via `interpolate(html, subject, ctx, registry)`.
   */
  area?: string;
  /**
   * Optional signature HTML. Mirrors the new `InterpolationContext.firma`
   * field. When omitted, defaults to the empty string — the registry
   * replaces it with a visible `[Falta configurar firma]` placeholder so
   * the containing block is preserved (option B in the bug-fix plan).
   */
  firma?: string;
  /**
   * Full patient data. The `{{dni}}` and `{{nombrePaciente}}` resolvers
   * read from `ctx.patients[0]`. When omitted, defaults to `[]` (legacy
   * behaviour: those tokens resolve to `''` and their blocks are
   * removed). Tests that don't care about patient fields can omit it.
   */
  patients?: Patient[];
  /**
   * Full file data. Reserved for table resolvers and any future
   * per-file tokens. When omitted, defaults to `[]`.
   */
  files?: PatientFile[];
  /**
   * Proyecto / Destino of the first selected patient/ficha. Mirrors the
   * required `InterpolationContext.destino` field. When omitted,
   * defaults to `''` — the `{{destino}}` resolver then returns empty
   * and its containing body block is removed.
   */
  destino?: string;
}

export interface InterpolateSpitchResult {
  html: string;
  subject: string;
}

const AREA_DEFAULT = 'consolidados';

/**
 * Localised date format (es-PE long). Mirrors the legacy
 * `interpolateSpitch` default. Kept as a free function so tests can
 * spy on it via `vi.spyOn(Date.prototype, 'toLocaleDateString')` if
 * they need to.
 */
function defaultToday(): string {
  return new Date().toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function interpolateSpitch(params: InterpolateSpitchParams): InterpolateSpitchResult {
  const {
    html,
    subject,
    companyName,
    patientNames,
    fileNames,
    today,
    area = AREA_DEFAULT,
    firma = '',
    patients,
    files,
    destino = '',
  } = params;

  const registry = buildTokenResolverRegistry(area);
  const ctx: InterpolationContext = {
    companyName,
    patientNames,
    fileNames,
    firma,
    patients: patients ?? [],
    files: files ?? [],
    area,
    today: today ?? defaultToday(),
    destino,
  };

  return interpolateCore(html, subject, ctx, registry);
}
