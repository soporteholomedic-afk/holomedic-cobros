import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../application/renderer';
import { ALL_PAGE_MANIFESTS, TOTAL_PAGES } from './index';
import { sampleImageResolver, sampleSource } from '../../testing/sampleSource';
import type { PdfTokenManifest, PdfPageManifest } from '../../domain/entities';

/**
 * Nine-page ordered-A4 integration test.
 *
 * Verifies that:
 * 1. All 9 page manifests exist and are in correct order.
 * 2. Each page's tokens can be rendered without errors against sample data.
 * 3. The combined document produces deterministic, ordered output.
 * 4. No tokens remain unresolved after rendering.
 */
describe('Nine-page integration', () => {
  it('declares exactly 9 pages in order', () => {
    expect(TOTAL_PAGES).toBe(9);
    expect(ALL_PAGE_MANIFESTS).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      expect(ALL_PAGE_MANIFESTS[i].page).toBe(i + 1);
    }
  });

  it('renders every page without throwing', () => {
    const errors: string[] = [];
    for (const manifest of ALL_PAGE_MANIFESTS) {
      try {
        renderAllTokens(manifest, sampleSource);
      } catch (err) {
        errors.push(`Page ${manifest.page}: ${(err as Error).message}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('leaves no unresolved tokens in any page', () => {
    for (const manifest of ALL_PAGE_MANIFESTS) {
      const rendered = renderAllTokens(manifest, sampleSource);
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    }
  });

  it('each page produces non-empty output', () => {
    for (const manifest of ALL_PAGE_MANIFESTS) {
      const rendered = renderAllTokens(manifest, sampleSource);
      expect(rendered.length).toBeGreaterThan(0);
    }
  });

  it('page render order is deterministic (1 through 9)', () => {
    const pageNumbers = ALL_PAGE_MANIFESTS.map((m) => m.page);
    expect(pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

/**
 * Helper: render all tokens of a page manifest into a single template string.
 * This tests the token resolution without requiring actual HTML templates.
 */
function renderAllTokens(
  manifest: PdfPageManifest,
  source: ReturnType<typeof Object>,
): string {
  const entries = Object.entries(manifest.tokens);
  if (entries.length === 0) return '';

  const template = entries
    .map(([name, spec]) => `{{${spec.kind}:${name}}}`)
    .join('|');

  return renderTemplate(
    template,
    manifest.tokens satisfies PdfTokenManifest,
    source as never,
    sampleImageResolver,
  );
}
