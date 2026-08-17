import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { inlineAssets, loadImageAsDataUri } from './assets';
import { renderTemplate } from '../application/renderer';
import { PAGE_1_MANIFEST } from './templates/page1';
import { sampleSource } from '../testing/sampleSource';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const ASSETS_ROOT = path.join(PUBLIC_ROOT, 'musculoesqueletica-pdf', 'assets');

const MAX_IMAGE_BYTES = 512 * 1024;
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

function realImageResolver(assetPath: string): string | null {
  return loadImageAsDataUri(assetPath, {
    baseDir: PUBLIC_ROOT,
    roots: [ASSETS_ROOT],
    allowedExtensions: ALLOWED_EXTENSIONS,
    maxBytes: MAX_IMAGE_BYTES,
  });
}

describe('page-1 offline asset pipeline (real template)', () => {
  it('renders the shipped page-1 template fully offline with real data', () => {
    const templatePath = path.join(PUBLIC_ROOT, PAGE_1_MANIFEST.template);
    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    // The template itself must not reference any network URL.
    expect(templateHtml).not.toMatch(/https?:\/\//);

    const offlineHtml = inlineAssets(templateHtml, path.dirname(templatePath));

    // No remote stylesheets or font references remain.
    expect(offlineHtml).not.toMatch(/https?:\/\//);
    expect(offlineHtml).not.toContain('<link rel="stylesheet"');
    // Self-hosted fonts are inlined as data URIs.
    expect(offlineHtml).toContain('data:font/woff2;base64,');
    expect(offlineHtml).toContain('Hanken Grotesk');
    expect(offlineHtml).toContain('Inter');

    const rendered = renderTemplate(
      offlineHtml,
      PAGE_1_MANIFEST.tokens,
      sampleSource,
      realImageResolver,
    );

    // Real mapped values appear escaped on the page.
    expect(rendered).toContain('ACME &amp; Sons &lt;CIA&gt;');
    expect(rendered).toContain('Juan &quot;El&quot; Pérez');
    expect(rendered).toContain('2024-MS-089');
    // Deterministic checks: hombro pain + male sexo radio are on.
    expect(rendered).toContain('value="M" checked');
    expect(rendered).toContain('<input type="checkbox" checked> Periódico');
    // Figures resolved to local data URIs (no remote src remains).
    expect(rendered).not.toContain('src="http');
    expect(rendered).toContain('data:image/png;base64,');
    expect(rendered).toContain('data:image/svg+xml;base64,');
    expect(rendered).toContain('data-figure');
    // No token may remain unresolved.
    expect(rendered).not.toContain('{{');
  });

  it('loads the shipped figure assets within the allowed limits', () => {
    for (const asset of ['hombro.png', 'mano.png', 'codo.svg']) {
      const uri = realImageResolver(`musculoesqueletica-pdf/assets/${asset}`);
      expect(uri, asset).not.toBeNull();
      expect(uri!, asset).toMatch(/^data:image\/(png|svg\+xml);base64,/);
    }
  });
});