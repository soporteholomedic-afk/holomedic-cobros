/**
 * `buildTokenResolverRegistry(area)` — pure factory (PR 4).
 *
 * Returns a `TokenResolverRegistry` that knows how to resolve every
 * `{{token}}` and `{{tabla:name:cols}}` placeholder for the given
 * area. The implementation is a thin closure-based dispatcher — no
 * external state, fully testable, server/client agnostic.
 *
 * Areas with a resolver branch:
 *   - `consolidados` — full set (empresa, fecha, fechaExamen, paciente,
 *                      nombrePaciente, dni, totalPacientes, totalExamenes,
 *                      listaPacientes, listaArchivos, firma, destino + the
 *                      two table sub-resolvers).
 *   - `cobranza`     — REQ-01 DIR-06 (empresa, ruc, fecha, montoTotal,
 *                      moneda, diasVencidos, cuentasBancarias, firma +
 *                      the documentosPendientes table sub-resolver).
 *   - `valoraciones` — REQ-03 M-R2 (empresa, ruc, periodo, moneda, total,
 *                      fecha, firma + the tablaValoraciones table
 *                      sub-resolver).
 *
 * Unknown areas return a registry whose `resolveToken` always returns
 * `''` and `resolveTable` always returns `''`. The orchestrator then
 * removes every token-bearing block. This is the documented failure
 * mode and matches the prior behaviour (unknown `{{token}}` was left
 * as `''` after the string-replace loop). The areaRegistryConsistency
 * test guards against a registered area silently hitting this path.
 *
 * Spec delta `envio-resultados` MODIFIED: "TokenResolverRegistry and
 * InterpolationContext" + "New tokens firma and tabla".
 */
import { documentosVencidosResolver } from './documentosVencidosResolver';
import { documentosPendientesResolver } from './documentosPendientesResolver';
import { tablaCobranzaResolver } from './tablaCobranzaResolver';
import { tablaValoracionesResolver } from './tablaValoracionesResolver';
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
 * Tokens that produce HTML (listas, firma, cuentasBancarias) return
 * `subject: ''` so the placeholder is cleanly removed from the subject line.
 */
function buildTokenMap(area: string): Map<string, (ctx: InterpolationContext) => ResolveResult> {
  const map = new Map<string, (ctx: InterpolationContext) => ResolveResult>();
  if (area === 'consolidados') {
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
  if (area === 'cobranza') {
    map.set('empresa', (ctx) => ({
      html: escapeHtml(ctx.companyName),
      subject: ctx.companyName,
    }));
    map.set('fecha', (ctx) => ({ html: ctx.today, subject: ctx.today }));
    // Plain pre-formatted debt fields — identical html/subject; missing
    // optional fields resolve to '' (signals block removal).
    map.set('ruc', (ctx) => ({ html: ctx.ruc ?? '', subject: ctx.ruc ?? '' }));
    map.set('montoTotal', (ctx) => ({
      html: ctx.montoTotal ?? '',
      subject: ctx.montoTotal ?? '',
    }));
    map.set('moneda', (ctx) => ({ html: ctx.moneda ?? '', subject: ctx.moneda ?? '' }));
    map.set('diasVencidos', (ctx) => ({
      html: ctx.diasVencidos ?? '',
      subject: ctx.diasVencidos ?? '',
    }));
    // HTML producer (buildCuentasBancariasHtml source) — body only.
    map.set('cuentasBancarias', (ctx) => ({
      html: ctx.cuentasBancariasHtml ?? '',
      subject: '',
    }));
    map.set('firma', (ctx) => ({
      html: ctx.firma !== '' ? ctx.firma : '<em>[Falta configurar firma]</em>',
      subject: '',
    }));
    return map;
  }
  if (area === 'valoraciones') {
    // REQ-03 M-R2: plain pre-formatted valorización fields. `ruc`/`moneda`/
    // `montoTotal` are the same optional context fields cobranza uses
    // (`montoTotal` backs the `total` token); `periodo` is
    // valoraciones-only. Missing optional fields resolve to '' (signals
    // block removal).
    map.set('empresa', (ctx) => ({
      html: escapeHtml(ctx.companyName),
      subject: ctx.companyName,
    }));
    map.set('ruc', (ctx) => ({ html: ctx.ruc ?? '', subject: ctx.ruc ?? '' }));
    map.set('fecha', (ctx) => ({ html: ctx.today, subject: ctx.today }));
    map.set('periodo', (ctx) => ({ html: ctx.periodo ?? '', subject: ctx.periodo ?? '' }));
    map.set('moneda', (ctx) => ({ html: ctx.moneda ?? '', subject: ctx.moneda ?? '' }));
    map.set('total', (ctx) => ({
      html: ctx.montoTotal ?? '',
      subject: ctx.montoTotal ?? '',
    }));
    map.set('firma', (ctx) => ({
      html: ctx.firma !== '' ? ctx.firma : '<em>[Falta configurar firma]</em>',
      subject: '',
    }));
    return map;
  }
  // Unknown area → every token resolves to ''.
  return map;
}

/** Build the table sub-resolver map for the given area. */
function buildTableMap(area: string): Map<string, (cols: string[], ctx: InterpolationContext) => string> {
  const map = new Map<string, (cols: string[], ctx: InterpolationContext) => string>();
  if (area === 'consolidados') {
    map.set(documentosVencidosResolver.name, documentosVencidosResolver.resolve);
    map.set(examenesResolver.name, examenesResolver.resolve);
    return map;
  }
  if (area === 'cobranza') {
    map.set(documentosPendientesResolver.name, documentosPendientesResolver.resolve);
    map.set(tablaCobranzaResolver.name, tablaCobranzaResolver.resolve);
    return map;
  }
  if (area === 'valoraciones') {
    map.set(tablaValoracionesResolver.name, tablaValoracionesResolver.resolve);
    return map;
  }
  // Unknown area → every table resolves to ''.
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
