import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

import { PdfImageCompressorAdapter } from '../PdfImageCompressorAdapter';
import { buildDctPdf } from './helpers/dctPdfBuilder';

/**
 * Adapter contract tests for `PdfImageCompressorAdapter` (spec RF1/RF5,
 * design §3.2/§6). This batch pins the two headline behaviors:
 *
 * - I1 — a heavy 2480×3456 DCT scan shrinks and its image dict reports
 *   the halved 1240×1728 dimensions with the `pdf-lib-image-email` id.
 * - I7 — a PDF with no eligible DCT image comes back byte-identically
 *   (no surgery, no save) with NO skippedReason: a no-op is a SUCCESS,
 *   not a passthrough (design §3.2 D3/D1).
 *
 * Fixtures come from the REAL-sharp `dctPdfBuilder` helper (RF8) — no
 * repo-tracked binaries, no module mocks. The fixtures' threshold facts
 * are pinned by `dctPdfBuilder.smoke.test.ts`: the 2480×3456 noise
 * fixture exceeds BOTH eligibility thresholds (eligible), while the
 * 1200×1500 flat fixture is px-eligible but stays below the bytes
 * threshold (ineligible — so I7 exercises the bytes gate for real).
 *
 * Later batches add the eligibility/preservation matrix (I2/I3/I5/I13…)
 * and the fail-open family (I4/I6/I8–I12/I15) on this same file.
 */

/**
 * Zero-copy view of a Buffer as a plain `Uint8Array` in the CURRENT realm.
 * Required for every test-side `PDFDocument.load`: under vitest's jsdom
 * realm a Node Buffer fails pdf-lib's `instanceof Uint8Array` validation.
 * In production Node both realms coincide and this is a no-op view.
 */
function asUint8ArrayView(bytes: Buffer): Uint8Array {
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Every image XObject stream in the document (dict Subtype /Image). */
function findImageDicts(doc: PDFDocument): PDFRawStream[] {
  const images: PDFRawStream[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const subtype = obj.dict.get(PDFName.of('Subtype'));
    if (subtype instanceof PDFName && subtype.asString() === '/Image') {
      images.push(obj);
    }
  }
  return images;
}

/** Direct-or-indirect numeric dict entry, or undefined when absent. */
function numberFrom(dict: PDFDict, name: string): number | undefined {
  const value = dict.lookup(PDFName.of(name));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
}

describe('PdfImageCompressorAdapter', () => {
  let adapter: PdfImageCompressorAdapter;

  beforeEach(() => {
    adapter = new PdfImageCompressorAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('I1 — heavy scan shrinks with halved dimensions', () => {
    it('re-encodes a 2480×3456 DCT scan into a smaller valid PDF whose image dict reports 1240×1728', async () => {
      const { bytes: input } = await buildDctPdf({
        width: 2480,
        height: 3456,
        content: 'noise',
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // Row contract (RF5/D1): the email-profile id on a success row.
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(result.bytes.length);
      expect(result.outputBytes).toBeLessThan(result.originalBytes);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(Buffer.isBuffer(result.bytes)).toBe(true);

      // A clean re-encode must not trip the fail-open warning.
      expect(warnSpy).not.toHaveBeenCalled();

      // Output reloads as a valid single-page PDF…
      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(reloaded.getPageCount()).toBe(1);

      // …and the image dict reports the halved dimensions (dict surgery:
      // Width/Height written from sharp's actual output info, design §3.2 D5).
      const images = findImageDicts(reloaded);
      expect(images).toHaveLength(1);
      expect(numberFrom(images[0].dict, 'Width')).toBe(1240);
      expect(numberFrom(images[0].dict, 'Height')).toBe(1728);
    }, 30_000);
  });

  describe('I7 — no eligible DCT images → byte-identical passthrough', () => {
    it('returns the original bytes untouched with no skippedReason and no warning', async () => {
      // 1200×1500 flat q75: px-eligible but stream < 512KB → NOT eligible.
      const { bytes: input } = await buildDctPdf({
        width: 1200,
        height: 1500,
        content: 'flat',
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // D1: even the no-op row carries the wired profile's method id…
      expect(result.method).toBe('pdf-lib-image-email');
      // …but a no-op success carries NO skippedReason (nothing was attempted,
      // design §3.2 D3) and the ORIGINAL bytes, byte-identically (no save()).
      expect(result.skippedReason).toBeUndefined();
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
