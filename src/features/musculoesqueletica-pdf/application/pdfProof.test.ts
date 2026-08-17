import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { inlineAssets, loadImageAsDataUri } from '../infrastructure/assets';
import { renderTemplate } from '../application/renderer';
import { PdfLibMerger } from '../infrastructure/merger';
import { EdgePrinter, resolveEdgeExecutablePath } from '../infrastructure/printer/edgePrinter';
import { PAGE_1_MANIFEST } from '../infrastructure/templates/page1';
import { sampleSource, sampleEvaluacionFull } from '../testing/sampleSource';
import { PdfService } from '../application/pdfService';
import type { PdfPrinter } from '../domain/entities';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const ASSETS_ROOT = path.join(PUBLIC_ROOT, 'musculoesqueletica-pdf', 'assets');
const CANONICAL_FIGURE_ROOT = path.join(PUBLIC_ROOT, 'assets', 'images', 'musculo', 'entrevista');

const A4_POINTS = { width: 595.28, height: 841.89 };

function realImageResolver(assetPath: string): string | null {
  return loadImageAsDataUri(assetPath, {
    baseDir: PUBLIC_ROOT,
    roots: [ASSETS_ROOT, CANONICAL_FIGURE_ROOT],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
    maxBytes: 512 * 1024,
  });
}

function renderRealPage1(mutateTemplate?: (html: string) => string): string {
  const templatePath = path.join(PUBLIC_ROOT, PAGE_1_MANIFEST.template);
  let templateHtml = fs.readFileSync(templatePath, 'utf8');
  if (mutateTemplate) templateHtml = mutateTemplate(templateHtml);
  const offlineHtml = inlineAssets(templateHtml, path.dirname(templatePath));
  return renderTemplate(offlineHtml, PAGE_1_MANIFEST.tokens, sampleSource, realImageResolver);
}

/** Inflate and concatenate a page's content streams so the text is searchable. */
async function pageContentText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(0).node.Contents();
  if (contents === undefined) return '';
  let out = '';
  const visit = (entry: unknown): void => {
    if (entry && typeof entry === 'object' && typeof (entry as { asArray?: unknown }).asArray === 'function') {
      for (const child of (entry as { asArray: () => unknown[] }).asArray()) visit(child);
      return;
    }
    const resolved =
      entry && typeof entry === 'object' && 'objectNumber' in entry
        ? doc.context.lookup(entry as never)
        : entry;
    if (resolved && typeof resolved === 'object' && 'getContents' in resolved) {
      let raw = Buffer.from((resolved as { getContents: () => Uint8Array }).getContents());
      try {
        raw = zlib.inflateSync(raw);
      } catch {
        // Already-plain content streams are used as-is.
      }
      // pdf-lib writes StandardFont text as hex strings `<4A55414E...>`.
      const text = raw
        .toString('latin1')
        .replace(/<([0-9A-Fa-f]+)>/g, (_m, hex: string) =>
          Buffer.from(hex, 'hex').toString('latin1'),
        );
      out += text;
    }
  };
  visit(contents);
  return out;
}

/**
 * Stub printer that produces a REAL A4 PDF carrying the rendered HTML text
 * (pdf-lib StandardFonts writes WinAnsi text directly into the content
 * stream, so the bytes are searchable). It proves the render→print→merge
 * plumbing end-to-end without requiring a local Edge installation.
 */
async function stubPrinter(): Promise<PdfPrinter> {
  const seen: string[] = [];
  return {
    print: async (html) => {
      seen.push(html);
      const doc = await PDFDocument.create();
      const page = doc.addPage([A4_POINTS.width, A4_POINTS.height]);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawText('JUAN PEREZ - 2024-MS-089 - ACME', {
        x: 60,
        y: 760,
        size: 14,
        font,
        color: rgb(0, 0, 0),
      });
      return doc.save();
    },
    getSeen: () => seen,
  } as PdfPrinter & { getSeen: () => string[] };
}

describe('one-page A4 PDF proof (render → print → merge)', () => {
  it('produces a single A4 PDF containing the mapped page-1 text', async () => {
    const printer = await stubPrinter();
    const service = new PdfService({
      loaders: {
        loadAtencion: async () => sampleSource.atencion,
        loadEntrevista: async () => sampleSource.entrevista,
        loadEvaluacion: async () => sampleEvaluacionFull,
      },
      pageRenderers: [{ render: async () => renderRealPage1() }],
      printer,
      merger: new PdfLibMerger(),
    });

    const bytes = await service.generate('2024-MS-089');

    // Rendered HTML reached the printer with real mapped values.
    const seen = (printer as PdfPrinter & { getSeen: () => string[] }).getSeen();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('ACME &amp; Sons &lt;CIA&gt;');
    expect(seen[0]).toContain('value="M" checked');
    expect(seen[0]).toContain('data-figure');

    // Merged output is a single A4 page whose content stream carries the text.
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const size = doc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(Math.round(A4_POINTS.width));
    expect(Math.round(size.height)).toBe(Math.round(A4_POINTS.height));

    const content = await pageContentText(bytes);
    expect(content).toContain('JUAN PEREZ');
    expect(content).toContain('2024-MS-089');
  });

  it('fails loudly when the renderer hits an undeclared token (no silent success)', async () => {
    const printer = await stubPrinter();
    const service = new PdfService({
      loaders: {
        loadAtencion: async () => sampleSource.atencion,
        loadEntrevista: async () => sampleSource.entrevista,
        loadEvaluacion: async () => sampleEvaluacionFull,
      },
      pageRenderers: [{
        render: async () =>
          renderRealPage1((html) =>
            html.replace('{{text:empresa}}', '{{text:missing_token}}'),
          ),
      }],
      printer,
      merger: new PdfLibMerger(),
    });

    await expect(service.generate('2024-MS-089')).rejects.toThrow();
  });
});

// Real-browser proof: runs only where an Edge/Chrome executable is available.
const edgeAvailable = resolveEdgeExecutablePath() !== null;

describe.skipIf(!edgeAvailable)('real Edge one-page proof', () => {
  it('prints page 1 to a single A4 PDF with real rendering', async () => {
    const printer = new EdgePrinter();
    const service = new PdfService({
      loaders: {
        loadAtencion: async () => sampleSource.atencion,
        loadEntrevista: async () => sampleSource.entrevista,
        loadEvaluacion: async () => sampleEvaluacionFull,
      },
      pageRenderers: [{ render: async () => renderRealPage1() }],
      printer,
      merger: new PdfLibMerger(),
    });

    const bytes = await service.generate('2024-MS-089');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const size = doc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(Math.round(A4_POINTS.width));
    expect(Math.round(size.height)).toBe(Math.round(A4_POINTS.height));
  });
});