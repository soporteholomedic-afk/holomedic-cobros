import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../application/renderer';
import { PAGE_2_MANIFEST } from './page2';
import { PAGE_3_MANIFEST } from './page3';
import { sampleImageResolver, sampleSource } from '../../testing/sampleSource';
import type { PdfTokenManifest, PdfSourceData } from '../../domain/entities';

function cloneDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Marks overlay test for pages 2-3.
 *
 * Verifies that:
 * 1. Parestesia nocturna/diurna figure tokens carry marks from the correct dot path.
 * 2. Columna cervical/dorsal figure tokens carry marks from the correct dot path.
 * 3. Marks resolve correctly against sample data with marks populated.
 * 4. No marks → plain figure (no overlay).
 */
describe('Marks overlay — pages 2-3', () => {
  function makeSourceWithMarks(): PdfSourceData {
    const src = cloneDeep(sampleSource) as PdfSourceData;
    // Parestesia nocturna: add 2 marks on hands
    src.entrevista!.parestesiaNocturna.areaDistribucionAnotaciones = [
      { id: 'pn1', x: 0.2, y: 0.4 },
      { id: 'pn2', x: 0.8, y: 0.6 },
    ];
    // Parestesia diurna: add 1 mark on torso
    src.entrevista!.parestesiaDiurna.areaDistribucionAnotaciones = [
      { id: 'pd1', x: 0.5, y: 0.3 },
    ];
    // Columna cervical: add 1 mark
    src.entrevista!.columna.areaDistribucionAnotaciones.cervical = [
      { id: 'cc1', x: 0.5, y: 0.5 },
    ];
    // Columna dorsal/lumbo-sacra: add 2 marks
    src.entrevista!.columna.areaDistribucionAnotaciones.dorsalLumboSacra = [
      { id: 'cd1', x: 0.3, y: 0.7 },
      { id: 'cd2', x: 0.6, y: 0.2 },
    ];
    return src;
  }

  function renderToken(
    manifest: PdfTokenManifest,
    tokenName: string,
    source: PdfSourceData,
  ): string {
    const spec = manifest[tokenName];
    const template = `{{${spec.kind}:${tokenName}}}`;
    return renderTemplate(template, manifest, source, sampleImageResolver);
  }

  describe('Page 2 — parestesia nocturna figure', () => {
    it('resolves the hands figure with marks overlay', () => {
      const src = makeSourceWithMarks();
      const html = renderToken(PAGE_2_MANIFEST.tokens, 'figure_pn_manos', src);
      // Should contain the img tag
      expect(html).toContain('<img src="data:');
      expect(html).toContain('data-figure');
      // Should contain the SVG marks overlay
      expect(html).toContain('<svg viewBox="0 0 117 81"');
      expect(html).toContain('position:absolute');
      // Should contain 2 red X marks (4 lines total)
      const lineCount = (html.match(/<line /g) || []).length;
      expect(lineCount).toBe(4); // 2 marks × 2 lines each
    });

    it('renders plain figure when no marks', () => {
      const src = cloneDeep(sampleSource) as PdfSourceData;
      src.entrevista!.parestesiaNocturna.areaDistribucionAnotaciones = [];
      const html = renderToken(PAGE_2_MANIFEST.tokens, 'figure_pn_manos', src);
      expect(html).toContain('<img src="data:');
      expect(html).not.toContain('<svg');
    });
  });

  describe('Page 2 — parestesia diurna figure', () => {
    it('resolves the torso figure with marks overlay', () => {
      const src = makeSourceWithMarks();
      const html = renderToken(PAGE_2_MANIFEST.tokens, 'figure_pd_torso', src);
      expect(html).toContain('<img src="data:');
      expect(html).toContain('<svg viewBox="0 0 110 136"');
      const lineCount = (html.match(/<line /g) || []).length;
      expect(lineCount).toBe(2); // 1 mark × 2 lines
    });
  });

  describe('Page 3 — columna cervical figure', () => {
    it('resolves the cervical figure with marks overlay', () => {
      const src = makeSourceWithMarks();
      const html = renderToken(PAGE_3_MANIFEST.tokens, 'figure_ccervical', src);
      expect(html).toContain('<img src="data:');
      expect(html).toContain('<svg viewBox="0 0 192 139"');
      const lineCount = (html.match(/<line /g) || []).length;
      expect(lineCount).toBe(2); // 1 mark × 2 lines
    });
  });

  describe('Page 3 — columna dorsal/lumbo-sacra figure', () => {
    it('resolves the dorsal figure with marks overlay', () => {
      const src = makeSourceWithMarks();
      const html = renderToken(PAGE_3_MANIFEST.tokens, 'figure_cdorsal', src);
      expect(html).toContain('<img src="data:');
      expect(html).toContain('<svg viewBox="0 0 207 235"');
      const lineCount = (html.match(/<line /g) || []).length;
      expect(lineCount).toBe(4); // 2 marks × 2 lines
    });
  });

  describe('Marks coordinates are clamped 0..1', () => {
    it('clamps out-of-range marks to 0..1', () => {
      const src = makeSourceWithMarks();
      src.entrevista!.parestesiaNocturna.areaDistribucionAnotaciones = [
        { id: 'clamp', x: 1.5, y: -0.3 },
      ];
      const html = renderToken(PAGE_2_MANIFEST.tokens, 'figure_pn_manos', src);
      // x=1.5 clamped to 1.0 → cx = 1.0 * 117 = 117
      // y=-0.3 clamped to 0.0 → cy = 0.0 * 81 = 0
      expect(html).toContain('x1="112"'); // 117 - 5
      expect(html).toContain('y1="-5"');  // 0 - 5
    });
  });
});
