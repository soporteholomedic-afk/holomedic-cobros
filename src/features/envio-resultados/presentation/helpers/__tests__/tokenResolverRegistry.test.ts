/**
 * RED tests for the interpolation registry (PR 4).
 *
 * These tests describe the EXPECTED behavior of the new
 * `TokenResolverRegistry` (per spec delta "TokenResolverRegistry and
 * InterpolationContext") and the `firma` / table sub-resolvers (per
 * "New tokens firma and tabla").
 *
 * The test file imports from files that do not exist yet → real RED.
 * The next commit (GREEN) implements the registry and resolvers; these
 * tests then pass.
 */
import { describe, it, expect } from 'vitest';

import { buildTokenResolverRegistry } from '../tokenResolvers/buildTokenResolverRegistry';
import { GOLDEN_CTX } from './goldenFixtures';

describe('TokenResolverRegistry — buildTokenResolverRegistry(area)', () => {
  it('returns a registry for area "consolidados"', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry).toBeDefined();
    expect(typeof registry.resolveToken).toBe('function');
    expect(typeof registry.resolveTable).toBe('function');
  });

  it('resolves the simple keys for consolidados: empresa, fecha, paciente, totals, listas, firma', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    // Plain-text tokens: .html and .subject are identical (no special chars)
    expect(registry.resolveToken('empresa', GOLDEN_CTX).subject).toBe('Clínica Demo S.A.');
    expect(registry.resolveToken('fecha', GOLDEN_CTX).subject).toBe('15 de enero de 2026');
    expect(registry.resolveToken('paciente', GOLDEN_CTX).subject).toBe('Juan Pérez');
    expect(registry.resolveToken('nombrePaciente', GOLDEN_CTX).subject).toBe('Juan Pérez');
    expect(registry.resolveToken('dni', GOLDEN_CTX).subject).toBe('12345678');
    expect(registry.resolveToken('totalPacientes', GOLDEN_CTX).subject).toBe('2');
    expect(registry.resolveToken('totalExamenes', GOLDEN_CTX).subject).toBe('2');
    // HTML-output tokens: .html carries the markup, .subject is ''
    expect(registry.resolveToken('firma', GOLDEN_CTX).html).toBe(
      '<p>Dr. Pérez — Clínica Demo S.A.</p>',
    );
  });

  it('HTML-escapes patient names with special chars in {{nombrePaciente}}', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const evil = {
      ...GOLDEN_CTX,
      patients: [
        { ...GOLDEN_CTX.patients[0]!, name: '<script>alert(1)</script>' },
      ],
    };
    const out = registry.resolveToken('nombrePaciente', evil);
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<script>');
    // Subject stays raw (no HTML-escape)
    expect(out.subject).toBe('<script>alert(1)</script>');
  });

  it('resolves {{dni}} to empty string when there are no patients (no crash, signals removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const empty = { ...GOLDEN_CTX, patients: [] };
    expect(registry.resolveToken('dni', empty).html).toBe('');
    expect(registry.resolveToken('nombrePaciente', empty).html).toBe('');
  });

  it('resolves {{listaPacientes}} as an auto-numbered <ol> list (one per patient)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveToken('listaPacientes', GOLDEN_CTX);
    expect(out.html).toMatch(/^<ol>/);
    expect(out.html).toMatch(/<\/ol>$/);
    expect(out.html).toContain('<li>Juan Pérez</li>');
    expect(out.html).toContain('<li>María Gómez</li>');
    expect(out.subject).toBe('');
  });

  it('resolves {{listaPacientes}} to a visible placeholder when ctx.patientNames is empty', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const empty = { ...GOLDEN_CTX, patientNames: [] };
    expect(registry.resolveToken('listaPacientes', empty).html).toBe('<em>[Lista vacía]</em>');
  });

  it('resolves {{listaArchivos}} as an HTML <li> list (one per file)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveToken('listaArchivos', GOLDEN_CTX);
    expect(out.html).toContain('<li>CAMO.pdf</li>');
    expect(out.html).toContain('<li>EMO.pdf</li>');
    expect(out.subject).toBe('');
  });

  it('resolves {{fechaExamen}} to ctx.today (alias of fecha)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveToken('fechaExamen', GOLDEN_CTX).subject).toBe('15 de enero de 2026');
  });

  it('HTML-escapes names that could contain <, >, &, " in listaPacientes and listaArchivos', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const evil = {
      ...GOLDEN_CTX,
      patientNames: ['<script>alert(1)</script>'],
      fileNames: ['A & B "C".pdf'],
    };
    const listP = registry.resolveToken('listaPacientes', evil);
    expect(listP.html).toContain('&lt;script&gt;');
    expect(listP.html).not.toContain('<script>');
    const listF = registry.resolveToken('listaArchivos', evil);
    expect(listF.html).toContain('&amp;');
    expect(listF.html).toContain('&quot;');
  });

  it('returns "" for an unknown simple key (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveToken('doesNotExist', GOLDEN_CTX).html).toBe('');
  });

  it('resolves {{destino}} with HTML-escaped body and raw subject (spec: Body interpolation escapes destination)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const ctx = { ...GOLDEN_CTX, destino: 'A & B <C>' };
    const out = registry.resolveToken('destino', ctx);
    expect(out.html).toBe('A &amp; B &lt;C&gt;');
    expect(out.html).not.toContain('<C>');
    expect(out.subject).toBe('A & B <C>');
    expect(out.subject).not.toContain('&amp;');
  });

  it('uses the first patient/ficha destination for a batch (spec: First selected patient wins in a batch)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const batchCtx = {
      ...GOLDEN_CTX,
      patients: [
        { ...GOLDEN_CTX.patients[0]!, name: 'Primero' },
        { ...GOLDEN_CTX.patients[0]!, name: 'Segundo' },
      ],
      destino: 'Proyecto Primero',
    };
    // The batch value is the destination of the first selected patient/ficha.
    expect(registry.resolveToken('destino', batchCtx).subject).toBe('Proyecto Primero');
  });

  it('resolves {{destino}} to empty { html: "", subject: "" } when the value is missing (spec: Missing destination removes its body block)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const emptyCtx = { ...GOLDEN_CTX, destino: '' };
    const out = registry.resolveToken('destino', emptyCtx);
    expect(out).toEqual({ html: '', subject: '' });
  });

  it('resolves {{firma}} to a visible placeholder when ctx.firma is empty (option B — no removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const emptyCtx = { ...GOLDEN_CTX, firma: '' };
    const out = registry.resolveToken('firma', emptyCtx);
    expect(out.html).toContain('[Falta configurar firma]');
    expect(out.html).not.toBe('');
  });

  it('resolves {{firma}} to ctx.firma verbatim when it is non-empty (no placeholder)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveToken('firma', GOLDEN_CTX);
    expect(out.html).toBe('<p>Dr. Pérez — Clínica Demo S.A.</p>');
    expect(out.html).not.toContain('[Falta configurar firma]');
  });

  it('uses the registry factory pattern: same area → same behaviour, different area → no cross-talk', () => {
    const a = buildTokenResolverRegistry('consolidados');
    const b = buildTokenResolverRegistry('consolidados');
    expect(a.resolveToken('empresa', GOLDEN_CTX).subject).toBe(b.resolveToken('empresa', GOLDEN_CTX).subject);
  });
});

describe('TokenResolverRegistry — resolveTable (firma / table sub-resolvers)', () => {
  it('renders a full HTML <table> for documentosVencidos with ONLY the selected columns', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('documentosVencidos', ['fecha', 'monto'], GOLDEN_CTX);
    expect(out.html).toMatch(/<table[\s>]/);
    expect(out.html).toContain('<th');
    expect(out.html).toContain('Fecha');
    expect(out.html).toContain('Monto');
    // The "Paciente" column was NOT selected — must NOT appear.
    expect(out.html).not.toContain('Paciente');
    expect(out.subject).toBe('');
  });

  it('renders a full HTML <table> for examenes with ONLY the selected columns', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('examenes', ['fecha', 'resultado'], GOLDEN_CTX);
    expect(out.html).toMatch(/<table[\s>]/);
    expect(out.html).toContain('Fecha');
    expect(out.html).toContain('Resultado');
    // The "Examen" column was NOT selected — its human label
    // ("Examen") must NOT appear in the output. Note: `<th` itself
    // IS present (the selected columns render as `<th>`); we
    // assert the *excluded* column label, not the tag.
    expect(out.html).not.toContain('>Examen<');
    // Sanity: there should be a body row.
    expect(out.html).toMatch(/<tr[\s>]/);
    expect(out.subject).toBe('');
  });

  it('preserves the column selection ORDER (first selected = first column)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('examenes', ['resultado', 'fecha'], GOLDEN_CTX);
    const rIdx = out.html.indexOf('Resultado');
    const fIdx = out.html.indexOf('Fecha');
    expect(rIdx).toBeGreaterThanOrEqual(0);
    expect(fIdx).toBeGreaterThanOrEqual(0);
    expect(rIdx).toBeLessThan(fIdx);
  });

  it('returns "" for an unknown table name (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveTable('notARegisteredTable', ['col'], GOLDEN_CTX).html).toBe('');
  });

  it('returns "" for an empty column selection (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveTable('documentosVencidos', [], GOLDEN_CTX).html).toBe('');
  });
});

describe('TokenResolverRegistry — does NOT touch the global module-level TODAY (spec: Injectable today fixes date bug)', () => {
  it('uses the ctx.today from the FIRST call, not a frozen module constant', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const ctx1 = { ...GOLDEN_CTX, today: '2026-01-01' };
    const ctx2 = { ...GOLDEN_CTX, today: '2026-02-02' };
    expect(registry.resolveToken('fecha', ctx1).subject).toBe('2026-01-01');
    expect(registry.resolveToken('fecha', ctx2).subject).toBe('2026-02-02');
  });
});
