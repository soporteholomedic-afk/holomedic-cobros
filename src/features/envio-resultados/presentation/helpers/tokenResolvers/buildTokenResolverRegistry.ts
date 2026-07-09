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
 *                       listaPacientes, listaArchivos, firma + the two table
 *                       sub-resolvers).
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
import type { InterpolationContext, TokenResolverRegistry } from './types';
import { escapeHtml } from './escapeHtml';

/**
 * Build the token sub-resolver map for the given area. Returns a
 * `Map<key, resolve(ctx)>` for fast dispatch. Keys mirror the prior
 * `interpolateSpitch` placeholder set plus the new `firma` token.
 */
function buildTokenMap(area: string): Map<string, (ctx: InterpolationContext) => string> {
  const map = new Map<string, (ctx: InterpolationContext) => string>();
  if (area !== 'consolidados') {
    return map; // Unknown area → every token resolves to ''.
  }
  map.set('empresa', (ctx) => escapeHtml(ctx.companyName));
  map.set('fecha', (ctx) => ctx.today);
  map.set('fechaExamen', (ctx) => ctx.today);
  map.set('paciente', (ctx) => escapeHtml(ctx.patientNames[0] ?? ''));
  map.set('nombrePaciente', (ctx) => escapeHtml(ctx.patients[0]?.name ?? ''));
  map.set('dni', (ctx) => ctx.patients[0]?.dni ?? '');
  map.set('totalPacientes', (ctx) => String(ctx.patientNames.length));
  map.set('totalExamenes', (ctx) => String(ctx.fileNames.length));
  map.set('listaPacientes', (ctx) =>
    ctx.patientNames.map((name) => `    <li>${escapeHtml(name)}</li>`).join('\n'),
  );
  map.set('listaArchivos', (ctx) =>
    ctx.fileNames.map((name) => `    <li>${escapeHtml(name)}</li>`).join('\n'),
  );
  map.set('firma', (ctx) =>
    ctx.firma !== '' ? ctx.firma : '<em>[Falta configurar firma]</em>',
  );
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
      return fn ? fn(ctx) : '';
    },
    resolveTable(name, cols, ctx) {
      const fn = tables.get(name);
      return fn ? fn(cols, ctx) : '';
    },
  };
}
