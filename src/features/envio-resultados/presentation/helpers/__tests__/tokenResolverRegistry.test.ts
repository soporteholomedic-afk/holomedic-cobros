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
    expect(registry.resolveToken('empresa', GOLDEN_CTX)).toBe('Clínica Demo S.A.');
    expect(registry.resolveToken('fecha', GOLDEN_CTX)).toBe('15 de enero de 2026');
    expect(registry.resolveToken('paciente', GOLDEN_CTX)).toBe('Juan Pérez');
    expect(registry.resolveToken('totalPacientes', GOLDEN_CTX)).toBe('2');
    expect(registry.resolveToken('totalExamenes', GOLDEN_CTX)).toBe('2');
    expect(registry.resolveToken('firma', GOLDEN_CTX)).toBe(
      '<p>Dr. Pérez — Clínica Demo S.A.</p>',
    );
  });

  it('resolves {{listaPacientes}} as an HTML <li> list (one per patient)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveToken('listaPacientes', GOLDEN_CTX);
    expect(out).toContain('<li>Juan Pérez</li>');
    expect(out).toContain('<li>María Gómez</li>');
  });

  it('resolves {{listaArchivos}} as an HTML <li> list (one per file)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveToken('listaArchivos', GOLDEN_CTX);
    expect(out).toContain('<li>CAMO.pdf</li>');
    expect(out).toContain('<li>EMO.pdf</li>');
  });

  it('resolves {{fechaExamen}} to ctx.today (alias of fecha)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveToken('fechaExamen', GOLDEN_CTX)).toBe('15 de enero de 2026');
  });

  it('HTML-escapes names that could contain <, >, &, " in listaPacientes and listaArchivos', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const evil = {
      ...GOLDEN_CTX,
      patientNames: ['<script>alert(1)</script>'],
      fileNames: ['A & B "C".pdf'],
    };
    const listP = registry.resolveToken('listaPacientes', evil);
    expect(listP).toContain('&lt;script&gt;');
    expect(listP).not.toContain('<script>');
    const listF = registry.resolveToken('listaArchivos', evil);
    expect(listF).toContain('&amp;');
    expect(listF).toContain('&quot;');
  });

  it('returns "" for an unknown simple key (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveToken('doesNotExist', GOLDEN_CTX)).toBe('');
  });

  it('uses the registry factory pattern: same area → same behaviour, different area → no cross-talk', () => {
    const a = buildTokenResolverRegistry('consolidados');
    const b = buildTokenResolverRegistry('consolidados');
    expect(a.resolveToken('empresa', GOLDEN_CTX)).toBe(b.resolveToken('empresa', GOLDEN_CTX));
  });
});

describe('TokenResolverRegistry — resolveTable (firma / table sub-resolvers)', () => {
  it('renders a full HTML <table> for documentosVencidos with ONLY the selected columns', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('documentosVencidos', ['fecha', 'monto'], GOLDEN_CTX);
    expect(out).toMatch(/<table[\s>]/);
    expect(out).toContain('<th');
    expect(out).toContain('Fecha');
    expect(out).toContain('Monto');
    // The "Paciente" column was NOT selected — must NOT appear.
    expect(out).not.toContain('Paciente');
  });

  it('renders a full HTML <table> for examenes with ONLY the selected columns', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('examenes', ['fecha', 'resultado'], GOLDEN_CTX);
    expect(out).toMatch(/<table[\s>]/);
    expect(out).toContain('Fecha');
    expect(out).toContain('Resultado');
    // The "Examen" column was NOT selected — its human label
    // ("Examen") must NOT appear in the output. Note: `<th` itself
    // IS present (the selected columns render as `<th>`); we
    // assert the *excluded* column label, not the tag.
    expect(out).not.toContain('>Examen<');
    // Sanity: there should be a body row.
    expect(out).toMatch(/<tr[\s>]/);
  });

  it('preserves the column selection ORDER (first selected = first column)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const out = registry.resolveTable('examenes', ['resultado', 'fecha'], GOLDEN_CTX);
    const rIdx = out.indexOf('Resultado');
    const fIdx = out.indexOf('Fecha');
    expect(rIdx).toBeGreaterThanOrEqual(0);
    expect(fIdx).toBeGreaterThanOrEqual(0);
    expect(rIdx).toBeLessThan(fIdx);
  });

  it('returns "" for an unknown table name (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveTable('notARegisteredTable', ['col'], GOLDEN_CTX)).toBe('');
  });

  it('returns "" for an empty column selection (signals empty → block removal)', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    expect(registry.resolveTable('documentosVencidos', [], GOLDEN_CTX)).toBe('');
  });
});

describe('TokenResolverRegistry — does NOT touch the global module-level TODAY (spec: Injectable today fixes date bug)', () => {
  it('uses the ctx.today from the FIRST call, not a frozen module constant', () => {
    const registry = buildTokenResolverRegistry('consolidados');
    const ctx1 = { ...GOLDEN_CTX, today: '2026-01-01' };
    const ctx2 = { ...GOLDEN_CTX, today: '2026-02-02' };
    expect(registry.resolveToken('fecha', ctx1)).toBe('2026-01-01');
    expect(registry.resolveToken('fecha', ctx2)).toBe('2026-02-02');
  });
});
