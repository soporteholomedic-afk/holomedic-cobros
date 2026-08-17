import { describe, it, expect } from 'vitest';
import { PAGE_1_MANIFEST } from './page1';
import { PAGE_2_MANIFEST } from './page2';
import { PAGE_3_MANIFEST } from './page3';
import { PAGE_4_MANIFEST } from './page4';
import { PAGE_5_MANIFEST } from './page5';
import { PAGE_6_MANIFEST } from './page6';
import { PAGE_7_MANIFEST } from './page7';
import { PAGE_8_MANIFEST } from './page8';
import { PAGE_9_MANIFEST } from './page9';
import type { PdfPageManifest } from '../../domain/entities';

/**
 * Page-ownership proof: every page manifest must declare tokens rooted in
 * the correct data domain (entrevista for pages 1-4, evaluacion for pages 5-9).
 *
 * This test catches a mis-mapped token that points at the wrong JSON root
 * (e.g. an evaluacion path on an entrevista page).
 */

const ALL_MANIFESTS: PdfPageManifest[] = [
  PAGE_1_MANIFEST,
  PAGE_2_MANIFEST,
  PAGE_3_MANIFEST,
  PAGE_4_MANIFEST,
  PAGE_5_MANIFEST,
  PAGE_6_MANIFEST,
  PAGE_7_MANIFEST,
  PAGE_8_MANIFEST,
  PAGE_9_MANIFEST,
];

/** Data roots that belong to each domain. */
const ENTREVISTA_ROOTS = ['entrevista.', 'atencion.'];
const EVALUACION_ROOTS = ['evaluacion.', 'evaluacionClinicaOsteomuscular.', 'evaluacionColumna.', 'evaluacionMotilidad.', 'maniobraLasegueRetraccionIsquioCrural.', 'maniobraWassermanRetraccionIleopsoas.', 'aproximacionDiagnosticaEvaluacion'];

function getDataTokens(manifest: PdfPageManifest): Array<{ name: string; path: string }> {
  return Object.entries(manifest.tokens)
    .filter(([, spec]) => spec.kind === 'text' || spec.kind === 'check')
    .map(([name, spec]) => ({ name, path: spec.path }));
}

function getRootPrefix(path: string): string {
  const firstDot = path.indexOf('.');
  return firstDot === -1 ? path : path.slice(0, firstDot + 1);
}

describe('Page ownership — entrevista vs evaluacion', () => {
  it('declares exactly 9 page manifests with sequential page numbers', () => {
    expect(ALL_MANIFESTS).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      expect(ALL_MANIFESTS[i].page).toBe(i + 1);
    }
  });

  it('pages 1-4 have tokens rooted in entrevista (or atencion)', () => {
    for (const manifest of ALL_MANIFESTS.slice(0, 4)) {
      const dataTokens = getDataTokens(manifest);
      expect(dataTokens.length).toBeGreaterThan(0);
      for (const token of dataTokens) {
        const root = getRootPrefix(token.path);
        const isEntrevista = ENTREVISTA_ROOTS.some((r) => root.startsWith(r));
        expect(
          isEntrevista,
          `Page ${manifest.page} token "${token.name}" has path "${token.path}" — expected entrevista root`,
        ).toBe(true);
      }
    }
  });

  it('pages 5-9 have tokens rooted in evaluacion', () => {
    for (const manifest of ALL_MANIFESTS.slice(4, 9)) {
      const dataTokens = getDataTokens(manifest);
      expect(dataTokens.length).toBeGreaterThan(0);
      for (const token of dataTokens) {
        const root = getRootPrefix(token.path);
        const isEvaluacion = EVALUACION_ROOTS.some((r) => root.startsWith(r));
        expect(
          isEvaluacion,
          `Page ${manifest.page} token "${token.name}" has path "${token.path}" — expected evaluacion root`,
        ).toBe(true);
      }
    }
  });

  it('each manifest has a non-empty template path', () => {
    for (const manifest of ALL_MANIFESTS) {
      expect(manifest.template).toBeTruthy();
      expect(manifest.template).toMatch(/^musculoesqueletica-pdf\/pages\/page\d+\.html$/);
    }
  });

  it('each manifest declares at least one token', () => {
    for (const manifest of ALL_MANIFESTS) {
      const count = Object.keys(manifest.tokens).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it('page 1 has the most tokens (datos generales + 3 segments)', () => {
    const p1Tokens = Object.keys(PAGE_1_MANIFEST.tokens).length;
    expect(p1Tokens).toBeGreaterThanOrEqual(80);
  });

  it('pages 2-3 cover entrevista parestesia/cervical/ausencia sections', () => {
    // Page 2 should have parestesiaNocturna + parestesiaDiurna + molestiaCervical + ausencia
    const p2Tokens = Object.keys(PAGE_2_MANIFEST.tokens);
    expect(p2Tokens.some((t) => t.includes('parestesia_nocturna'))).toBe(true);
    expect(p2Tokens.some((t) => t.includes('parestesia_diurna'))).toBe(true);
    expect(p2Tokens.some((t) => t.includes('cervical_irradiada'))).toBe(true);
    expect(p2Tokens.some((t) => t.includes('ausencia'))).toBe(true);

    // Page 3 should have columna cervical/dorsal/lumboSacra
    const p3Tokens = Object.keys(PAGE_3_MANIFEST.tokens);
    expect(p3Tokens.some((t) => t.includes('columna_cervical'))).toBe(true);
    expect(p3Tokens.some((t) => t.includes('columna_dorsal'))).toBe(true);
    expect(p3Tokens.some((t) => t.includes('columna_lumbo_sacra'))).toBe(true);
  });

  it('pages 5-7 cover evaluacion miembros superiores sections', () => {
    const p5Tokens = Object.keys(PAGE_5_MANIFEST.tokens);
    expect(p5Tokens.some((t) => t.includes('escapulo'))).toBe(true);

    const p6Tokens = Object.keys(PAGE_6_MANIFEST.tokens);
    expect(p6Tokens.some((t) => t.includes('codo_'))).toBe(true);
    expect(p6Tokens.some((t) => t.includes('muneca'))).toBe(true);

    const p7Tokens = Object.keys(PAGE_7_MANIFEST.tokens);
    expect(p7Tokens.some((t) => t.includes('parestesica') || t.includes('finkelstein'))).toBe(true);
  });

  it('pages 8-9 cover evaluacion columna and motilidad', () => {
    const p8Tokens = Object.keys(PAGE_8_MANIFEST.tokens);
    expect(p8Tokens.some((t) => t.includes('cifosis') || t.includes('lordosis') || t.includes('palp_cerv'))).toBe(true);

    const p9Tokens = Object.keys(PAGE_9_MANIFEST.tokens);
    expect(p9Tokens.some((t) => t.includes('motilidad'))).toBe(true);
    expect(p9Tokens.some((t) => t.includes('lasegue'))).toBe(true);
    expect(p9Tokens.some((t) => t.includes('wasserman'))).toBe(true);
  });
});
