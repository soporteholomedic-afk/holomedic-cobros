import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { PDFDocument } from 'pdf-lib';

import { EdgePrinter, resolveEdgeExecutablePath } from '@/features/musculoesqueletica-pdf/infrastructure/printer/edgePrinter';
import { makeRepFacturacion } from '../../../domain/fixtures';
import { agruparPorDestino } from '../../../domain/agrupacion';
import { HtmlValoracionPdfPrinter } from '../HtmlValoracionPdfPrinter';
import { MEMBRETE_HOLOMEDIC, buildValoracionHtml } from '../template';

/**
 * Runtime harness (task 2.5): renders the PRODUCTION template through the
 * REAL EdgePrinter with the valoraciones footer overrides — the U3
 * evidence that multi-page pagination + footer numbering work end-to-end.
 * Skipped where no Edge executable resolves (same pattern as
 * musculoesqueletica's `pdfProof.test.ts` real-Edge proof).
 */
const edgeAvailable = resolveEdgeExecutablePath() !== null;

/** Inflate a page's content streams into searchable latin1 text. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const perPage: string[] = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const contents = doc.getPage(i).node.Contents();
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
          // plain stream
        }
        out += raw.toString('latin1');
      }
    };
    visit(contents);
    perPage.push(out);
  }
  return perPage;
}

describe.skipIf(!edgeAvailable)('real Edge valoraciones PDF harness', () => {
  it('renders a multi-page A4 PDF with footer page numbers on every page', async () => {
    // 150 rows → several A4 pages.
    const rows = Array.from({ length: 150 }, (_, i) =>
      makeRepFacturacion({
        DesDes: `SEDE ${(i % 3) + 1}`,
        Pacien: `PACIENTE DEMO ${i + 1}`,
        VVtaMN: 100 + i,
      }),
    );
    const html = buildValoracionHtml({
      logoDataUri:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      membrete: MEMBRETE_HOLOMEDIC,
      cliente: { nombre: 'EMPRESA DEMO S.A.C.', ruc: '20512345678' },
      fecIni: '2026-01-01',
      fecFin: '2026-01-31',
      moneda: 'SOLES',
      fechaEmision: '27/08/2026',
      grupos: agruparPorDestino(rows, 1),
    });

    const printer = new HtmlValoracionPdfPrinter(new EdgePrinter());
    const bytes = await printer.print(html);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    for (let i = 0; i < doc.getPageCount(); i++) {
      const size = doc.getPage(i).getSize();
      // U6: A4 LANDSCAPE — width 841.89pt, height 595.28pt (the 13-column
      // table needs the horizontal page).
      expect(Math.round(size.width)).toBe(842);
      expect(Math.round(size.height)).toBe(595);
    }

    // Footer painted on every page: Chromium paints the header/footer
    // layer as the LAST clipped block (`... re / W* n` + scale `cm`), with
    // the footer text runs at its tail: [Página-prefix, N, "de", M].
    // (Spike-2-0 probe shape — glyph IDs, not literals, because the footer
    // font is a Chromium subset.)
    const texts = await pageTexts(bytes);
    expect(texts.length).toBe(doc.getPageCount());
    if (process.env.HARNESS_DEBUG) {
      console.log('PAGE1 TAIL:', JSON.stringify(texts[0].slice(-900)));
    }
    const numberGlyphs = texts.map((txt) => {
      const clipIdx = txt.lastIndexOf('W* n');
      const footerSlice = clipIdx >= 0 ? txt.slice(clipIdx) : txt;
      const runs = [...footerSlice.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => m[1]);
      expect(runs.length).toBeGreaterThanOrEqual(4); // prefix + N + "de" + M
      return runs[runs.length - 3]; // N (pageNumber)
    });
    const totalGlyph = (() => {
      const clipIdx = texts[0].lastIndexOf('W* n');
      const runs = [...texts[0].slice(clipIdx).matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => m[1]);
      return runs[runs.length - 1]; // M (totalPages)
    })();
    const uniqueNumbers = new Set(numberGlyphs);
    expect(uniqueNumbers.size).toBe(doc.getPageCount()); // 1..N distinct
    expect(numberGlyphs[numberGlyphs.length - 1]).toBe(totalGlyph); // last page = total
  }, 120_000);
});
