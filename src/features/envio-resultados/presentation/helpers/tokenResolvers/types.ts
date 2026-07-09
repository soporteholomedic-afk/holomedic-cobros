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
}

/**
 * A resolver for a single non-table token. Returns the string to insert
 * at the placeholder location. Return `''` to signal "empty" — the
 * orchestrator removes the containing block.
 */
export interface TokenResolver {
  /** The placeholder key WITHOUT the `{{}}` braces. E.g. `'empresa'`. */
  key: string;
  resolve(ctx: InterpolationContext): string;
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
  /** Resolve a simple `{{key}}` token. Returns `''` if unknown or empty. */
  resolveToken(key: string, ctx: InterpolationContext): string;
  /** Resolve a `{{tabla:name:cols}}` token. Returns `''` if unknown or empty. */
  resolveTable(name: string, cols: string[], ctx: InterpolationContext): string;
}
