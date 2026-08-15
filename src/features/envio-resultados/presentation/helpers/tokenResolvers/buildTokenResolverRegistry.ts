/**
 * `buildTokenResolverRegistry(area)` — pure factory (PR 4).
 *
 * Returns a `TokenResolverRegistry` that knows how to resolve every
 * `{{token}}` and `{{tabla:name:cols}}` placeholder for the given
 * area. The implementation is a thin closure-based dispatcher — no
 * external state, fully testable, server/client agnostic.
 *
 * v1 areas:
 *   - `consolidados` — full set (empresa, fecha, fechaExamen, paciente,
 *                       nombrePaciente, dni, totalPacientes, totalExamenes,
 *                       listaPacientes, listaArchivos, firma, destino + the
 *                       two table sub-resolvers).
 *
 * Unknown areas return a registry whose `resolveToken` always returns
 * `''` and `resolveTable` always returns `''`. The orchestrator then
 * removes every token-bearing block. This is the documented failure
 * mode and matches the prior behaviour (unknown `{{token}}` was left
 * as `''` after the string-replace loop).
 *
 * Spec delta `envio-resultados` MODIFIED: "TokenResolverRegistry and
 * InterpolationContext" + "New tokens firma and tabla".
 */
import { documentosVencidosResolver } from './documentosVencidosResolver';
import { examenesResolver } from './examenesResolver';
import type { InterpolationContext, ResolveResult, TokenResolverRegistry } from './types';
import { escapeHtml } from './escapeHtml';

/**
 * Build the token sub-resolver map for the given area. Returns a
 * `Map<key, resolve(ctx)>` for fast dispatch. Keys mirror the prior
 * `interpolateSpitch` placeholder set plus the new `firma` token.
 *
 * Each resolver returns a `ResolveResult` with differentiated values:
 * - `html` — HTML-escaped, safe for `dangerouslySetInnerHTML`.
 * - `subject` — raw text (never appears inside HTML markup).
 *
 * Tokens that produce HTML (listas, firma) return `subject: ''` so
 * the placeholder is cleanly removed from the subject line.
 */
function buildTokenMap(area: string): Map<string, (ctx: InterpolationContext) => ResolveResult> {
  const map = new Map<string, (ctx: InterpolationContext) => ResolveResult>();
  if (area !== 'consolidados') {
    return map; // Unknown area → every token resolves to ''.
  }
  map.set('empresa', (ctx) => ({
    html: escapeHtml(ctx.companyName),
    subject: ctx.companyName,
  }));
  map.set('fecha', (ctx) => ({ html: ctx.today, subject: ctx.today }));
  map.set('fechaExamen', (ctx) => ({ html: ctx.today, subject: ctx.today }));
  map.set('paciente', (ctx) => ({
    html: escapeHtml(ctx.patientNames[0] ?? ''),
    subject: ctx.patientNames[0] ?? '',
  }));
  map.set('nombrePaciente', (ctx) => ({
    html: escapeHtml(ctx.patients[0]?.name ?? ''),
    subject: ctx.patients[0]?.name ?? '',
  }));
  map.set('dni', (ctx) => ({
    html: ctx.patients[0]?.dni ?? '',
    subject: ctx.patients[0]?.dni ?? '',
  }));
  map.set('totalPacientes', (ctx) => ({
    html: String(ctx.patientNames.length),
    subject: String(ctx.patientNames.length),
  }));
  map.set('totalExamenes', (ctx) => ({
    html: String(ctx.fileNames.length),
    subject: String(ctx.fileNames.length),
  }));
  map.set('listaPacientes', (ctx) => ({
    html:
      ctx.patientNames.length === 0
        ? '<em>[Lista vacía]</em>'
        : `<ol>${ctx.patientNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ol>`,
    subject: '',
  }));
  map.set('listaArchivos', (ctx) => ({
    html: ctx.fileNames.map((name) => `    <li>${escapeHtml(name)}</li>`).join('\n'),
    subject: '',
  }));
  map.set('firma', (ctx) => ({
    html: ctx.firma !== '' ? ctx.firma : '<em>[Falta configurar firma]</em>',
    subject: '',
  }));
  map.set('destino', (ctx) => ({
    html: escapeHtml(ctx.destino),
    subject: ctx.destino,
  }));
  return map;
}

/** Build the table sub-resolver map for the given area. */
function buildTableMap(area: string): Map<string, (cols: string[], ctx: InterpolationContext) => string> {
  const map = new Map<string, (cols: string[], ctx: InterpolationContext) => string>();
  if (area !== 'consolidados') {
    return map; // Unknown area → every table resolves to ''.
  }
  map.set(documentosVencidosResolver.name, documentosVencidosResolver.resolve);
  map.set(examenesResolver.name, examenesResolver.resolve);
  return map;
}

/**
 * Pure factory. No side effects. Returns a fresh closure-bound registry
 * per call (cheap; not memoised — there is no expensive setup, and
 * memoisation would require module state that the test seam forbids).
 */
export function buildTokenResolverRegistry(area: string): TokenResolverRegistry {
  const tokens = buildTokenMap(area);
  const tables = buildTableMap(area);
  return {
    resolveToken(key, ctx) {
      const fn = tokens.get(key);
      return fn ? fn(ctx) : { html: '', subject: '' };
    },
    resolveTable(name, cols, ctx) {
      const fn = tables.get(name);
      return fn
        ? { html: fn(cols, ctx), subject: '' }
        : { html: '', subject: '' };
    },
  };
}
