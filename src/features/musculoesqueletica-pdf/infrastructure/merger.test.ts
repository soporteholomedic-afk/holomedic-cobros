import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfLibMerger } from './merger';
import { MergeError } from '../domain/errors';

async function singlePagePdf(width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return doc.save();
}

describe('PdfLibMerger', () => {
  it('merges multiple PDFs into one, preserving page order', async () => {
    const a4 = await singlePagePdf(595, 842);
    const small = await singlePagePdf(300, 400);

    const merger = new PdfLibMerger();
    const merged = await merger.merge([a4, small]);

    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 300, height: 400 });
  });

  it('merges a single PDF unchanged into one page', async () => {
    const a4 = await singlePagePdf(595, 842);

    const merger = new PdfLibMerger();
    const merged = await merger.merge([a4]);

    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });

  it('preserves order of three differently sized pages', async () => {
    const sizes: Array<[number, number]> = [
      [595, 842],
      [200, 300],
      [400, 600],
    ];
    const pdfs = await Promise.all(sizes.map(([w, h]) => singlePagePdf(w, h)));

    const merger = new PdfLibMerger();
    const merged = await merger.merge(pdfs);

    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    sizes.forEach(([w, h], i) => {
      expect(doc.getPage(i).getSize()).toEqual({ width: w, height: h });
    });
  });

  it('rejects non-PDF bytes with MergeError', async () => {
    const merger = new PdfLibMerger();
    await expect(merger.merge([new Uint8Array([1, 2, 3])])).rejects.toThrow(MergeError);
  });
});