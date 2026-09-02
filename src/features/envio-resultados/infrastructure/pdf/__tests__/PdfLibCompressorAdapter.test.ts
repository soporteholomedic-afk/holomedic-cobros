import { inflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDocument, PDFName, PDFRef, StandardFonts } from 'pdf-lib';

import { PdfLibCompressorAdapter } from '../PdfLibCompressorAdapter';

/**
 * Adapter contract tests for `PdfLibCompressorAdapter` (spec RF2, design §7).
 *
 * All fixtures use the REAL pdf-lib — no module mocks except the timeout
 * case (where a never-resolving `PDFDocument.load` is required).
 *
 * Fixture facts verified against pdf-lib ^1.17.1 and encoded below:
 * - A multi-page document saved with `useObjectStreams: false` re-saves
 *   strictly smaller through the adapter pipeline (object-stream packing).
 * - A canonical single-page save with empty-string metadata re-saves
 *   byte-identically, so the adapter's `>=` best-of branch is exercised.
 * - pdf-lib's save ends with the XRef stream as the LAST indirect object;
 *   injecting `/Encrypt 1 0 R` into that dict reproduces an encrypted PDF
 *   (load throws "Input document ... is encrypted").
 * - `drawText` stores standard-font text as UPPERCASE HEX inside the
 *   Flate-compressed content stream, so the marker scan inflates each page
 *   (Node stdlib `zlib` — no new dependencies) and searches the hex form.
 * - Inspecting stripped output must use `updateMetadata: false`, otherwise
 *   pdf-lib re-stamps an empty producer on load (empty string is falsy).
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

/** Builds a multi-page PDF drawing `HOLOMEDIC-MARKER-{i}` on page i. */
async function buildMarkerPdfBuffer(
  pageCount: number,
  options: { useObjectStreams: boolean; emptyMetadata?: boolean },
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(`HOLOMEDIC-MARKER-${i}`, { x: 50, y: 700, size: 12, font });
  }
  if (options.emptyMetadata) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setProducer('');
    doc.setCreator('');
  }
  return Buffer.from(await doc.save({ useObjectStreams: options.useObjectStreams }));
}

/**
 * Injects `/Encrypt 1 0 R` into the dict of the LAST indirect object —
 * always the XRef stream in a pdf-lib save — reproducing an encrypted PDF.
 */
function injectEncryptEntry(pdf: Buffer): Buffer {
  const objIdx = pdf.lastIndexOf(Buffer.from(' obj'));
  const dictIdx = pdf.indexOf(Buffer.from('<<'), objIdx);
  return Buffer.concat([
    pdf.subarray(0, dictIdx + 2),
    Buffer.from('/Encrypt 1 0 R '),
    pdf.subarray(dictIdx + 2),
  ]);
}

/** The pdf-lib object stored under a page's `/Contents` entry. */
interface ContentStreamLike {
  getContents(): Uint8Array;
}

/** Inflates and decodes page `pageIndex`'s content stream as latin1. */
function pageText(doc: PDFDocument, pageIndex: number): string {
  let contents = doc.getPage(pageIndex).node.get(PDFName.of('Contents'));
  if (contents instanceof PDFRef) {
    contents = doc.context.lookup(contents);
  }
  if (contents instanceof PDFArray) {
    contents = doc.context.lookup(contents.get(0));
  }
  const stream = contents as unknown as ContentStreamLike;
  return inflateSync(Buffer.from(stream.getContents())).toString('latin1');
}

/** pdf-lib encodes standard-font text as uppercase hex inside content streams. */
function hexText(text: string): string {
  return Buffer.from(text, 'ascii').toString('hex').toUpperCase();
}

/**
 * Zero-copy view of a Buffer as a plain `Uint8Array` in the CURRENT realm.
 * Required for every test-side `PDFDocument.load`: under vitest's jsdom
 * realm a Node Buffer fails pdf-lib's `instanceof Uint8Array` validation.
 * In production Node both realms coincide and this is a no-op view.
 */
function asUint8ArrayView(bytes: Buffer): Uint8Array {
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe('PdfLibCompressorAdapter', () => {
  let adapter: PdfLibCompressorAdapter;

  beforeEach(() => {
    adapter = new PdfLibCompressorAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('A1 — happy-path shrink (pdf-lib-lossless)', () => {
    it('shrinks an inefficiently serialized PDF, preserving every page structurally and by content', async () => {
      const input = await buildMarkerPdfBuffer(25, { useObjectStreams: false });
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // Size metrics + method: strictly smaller, fully reported.
      expect(result.method).toBe('pdf-lib-lossless');
      expect(result.skippedReason).toBeUndefined();
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(result.bytes.length);
      expect(result.outputBytes).toBeLessThan(result.originalBytes);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(Buffer.isBuffer(result.bytes)).toBe(true);

      // Structural equality: page count, per-page size, per-page rotation.
      const outputDoc = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(outputDoc.getPageCount()).toBe(inputDoc.getPageCount());
      const inputPages = inputDoc.getPages();
      const outputPages = outputDoc.getPages();
      expect(outputPages).toHaveLength(inputPages.length);
      expect(outputPages.length).toBeGreaterThan(0);
      for (let i = 0; i < inputPages.length; i++) {
        expect(outputPages[i].getSize()).toEqual(inputPages[i].getSize());
        expect(outputPages[i].getRotation().angle).toBe(inputPages[i].getRotation().angle);
      }

      // Content equality: every page's marker survives compression.
      for (let i = 0; i < inputPages.length; i++) {
        expect(pageText(outputDoc, i)).toContain(hexText(`HOLOMEDIC-MARKER-${i}`));
      }

      // The lossless path must NOT trip the fail-open warning.
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('A2 — recompression does not shrink (>= best-of branch)', () => {
    it('returns the original bytes unchanged with the grew passthrough', async () => {
      // Canonical pdf-lib save with empty metadata re-serializes
      // byte-identically → output.length >= input.length branch.
      const input = await buildMarkerPdfBuffer(1, {
        useObjectStreams: true,
        emptyMetadata: true,
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(result.method).toBe('pdf-lib-passthrough');
      expect(result.skippedReason).toBe('grew');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // 'grew' is a normal best-of outcome, not a failure — no warning.
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('A3 — malformed bytes fail open (parse-error)', () => {
    it('resolves with the original bytes and logs a warning (never throws)', async () => {
      const input = Buffer.from('not a pdf');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(result.method).toBe('pdf-lib-passthrough');
      expect(result.skippedReason).toBe('parse-error');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PdfLibCompressorAdapter] fail-open'),
        expect.objectContaining({ reason: 'parse-error', sizeBytes: input.length }),
      );
    });
  });

  describe('A4 — encrypted PDF fails open (encrypted)', () => {
    it('resolves with the original bytes and logs a warning (never throws)', async () => {
      const input = injectEncryptEntry(
        await buildMarkerPdfBuffer(1, { useObjectStreams: true }),
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(result.method).toBe('pdf-lib-passthrough');
      expect(result.skippedReason).toBe('encrypted');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PdfLibCompressorAdapter] fail-open'),
        expect.objectContaining({ reason: 'encrypted', sizeBytes: input.length }),
      );
    });
  });

  describe('A5 — metadata stripped', () => {
    it('empties title, author, subject, keywords, producer, and creator', async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawText('HOLOMEDIC-MARKER-0', { x: 50, y: 700, size: 12, font });
      doc.setTitle('Quarterly Report');
      doc.setAuthor('Doe, Jane');
      doc.setSubject('Clinical archive export');
      doc.setKeywords(['holomedic', 'archive']);
      doc.setProducer('SomeProducer 1.0');
      doc.setCreator('SomeCreator 2.0');
      const input = Buffer.from(await doc.save());

      const result = await adapter.compress(input);

      // Removing metadata shrinks this document → lossless pass.
      expect(result.method).toBe('pdf-lib-lossless');

      // Inspect with updateMetadata: false — pdf-lib re-stamps an empty
      // producer on a default load (empty string is falsy to it).
      const outputDoc = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(outputDoc.getTitle()).toBe('');
      expect(outputDoc.getAuthor()).toBe('');
      expect(outputDoc.getSubject()).toBe('');
      expect(outputDoc.getKeywords()).toBe('');
      expect(outputDoc.getProducer()).toBe('');
      expect(outputDoc.getCreator()).toBe('');
    });
  });

  describe('A6 — output validity', () => {
    it('produces output that reloads as a valid PDF via PDFDocument.load', async () => {
      const input = await buildMarkerPdfBuffer(3, { useObjectStreams: false });

      const result = await adapter.compress(input);

      // Default load options on purpose — the real-world reload path (the
      // view wrapper only normalizes the jsdom test realm; see helper).
      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes));
      expect(reloaded.getPageCount()).toBe(3);
    });
  });

  describe('timeout guard', () => {
    it('fails open with a warning when compression exceeds the budget (timeout)', async () => {
      const input = await buildMarkerPdfBuffer(1, { useObjectStreams: true });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Never-resolving load forces the Promise.race guard to win.
      vi.spyOn(PDFDocument, 'load').mockImplementation(
        () => new Promise<never>(() => {}),
      );
      const zeroBudget = new PdfLibCompressorAdapter(0);

      const result = await zeroBudget.compress(input);

      expect(result.method).toBe('pdf-lib-passthrough');
      expect(result.skippedReason).toBe('timeout');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PdfLibCompressorAdapter] fail-open'),
        expect.objectContaining({ reason: 'timeout', sizeBytes: input.length }),
      );
    });
  });
});
