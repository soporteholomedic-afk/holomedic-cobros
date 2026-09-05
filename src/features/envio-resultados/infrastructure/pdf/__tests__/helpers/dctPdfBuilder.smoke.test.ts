import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  PDF_IMAGE_MIN_DCT_STREAM_BYTES,
  PDF_IMAGE_MIN_LONGEST_SIDE_PX,
} from '../../constants';
import { buildDctPdf } from './dctPdfBuilder';

/**
 * Smoke tests for the `dctPdfBuilder` fixture helper (spec RF8, design §6).
 *
 * These tests pin the CONTRACT the fixture PDFs must honor before any
 * adapter test consumes them:
 * - Output must reload as a valid PDF via `PDFDocument.load` (realm-fixed
 *   bytes — under vitest's jsdom realm a raw Node Buffer fails pdf-lib's
 *   `instanceof Uint8Array` validation, hence `asUint8ArrayView`).
 * - The "eligible" fixture must exceed BOTH eligibility thresholds read
 *   from the production constants (`constants.ts`) — never local copies.
 * - The px-ineligible and bytes-ineligible fixtures must each fail
 *   exactly the threshold they were designed to fail.
 * - The corrupt fixture must be a structurally valid PDF whose image
 *   stream is SOI + garbage that sharp cannot decode (I6 fail-open
 *   fixture) while still being threshold-eligible.
 * - SMask, CMYK, gray, and filter-form variants must build and reload
 *   with the dict entries the adapter tests will assert against.
 *
 * All fixtures are built in-RAM with REAL sharp — no binaries, no mocks.
 */

/**
 * Zero-copy view of a Buffer as a plain `Uint8Array` in the CURRENT realm.
 * Same realm fix as `PdfLibCompressorAdapter.test.ts` — required for every
 * test-side `PDFDocument.load` / `embedJpg` / `embedPng` under jsdom.
 */
function asUint8ArrayView(bytes: Buffer): Uint8Array {
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The JPEG Start-Of-Image marker every corrupt fixture must start with. */
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

interface ImageXObjectView {
  dict: PDFDictLike;
  width: number;
  height: number;
  colorSpace: string | undefined;
  filterForm: 'name' | 'array' | 'none';
  filterNames: string[];
  contentLength: number;
  contents: Uint8Array;
}

/** Structural subset of pdf-lib's PDFDict used by these smoke tests. */
interface PDFDictLike {
  get(key: PDFName): unknown;
}

function readNumber(dict: PDFDictLike, key: string): number {
  const value = dict.get(PDFName.of(key));
  if (!(value instanceof PDFNumber)) {
    throw new Error(`Dict entry /${key} is not a PDFNumber`);
  }
  return value.asNumber();
}

function readColorSpace(dict: PDFDictLike): string | undefined {
  const value = dict.get(PDFName.of('ColorSpace'));
  return value instanceof PDFName ? value.asString() : undefined;
}

function readFilter(dict: PDFDictLike): {
  form: 'name' | 'array' | 'none';
  names: string[];
} {
  const filter = dict.get(PDFName.of('Filter'));
  if (filter instanceof PDFName) {
    return { form: 'name', names: [filter.asString()] };
  }
  if (filter instanceof PDFArray) {
    const names: string[] = [];
    for (let i = 0; i < filter.size(); i += 1) {
      const entry = filter.get(i);
      if (entry instanceof PDFName) {
        names.push(entry.asString());
      }
    }
    return { form: 'array', names };
  }
  return { form: 'none', names: [] };
}

/**
 * Reloads a fixture and collects every image XObject found among the
 * saved document's indirect objects, with the dict facts the adapter
 * tests care about (dims, colorspace, filter form, stream size/bytes).
 */
async function loadFixture(pdf: Buffer): Promise<{
  doc: PDFDocument;
  images: ImageXObjectView[];
}> {
  const doc = await PDFDocument.load(asUint8ArrayView(pdf), {
    updateMetadata: false,
  });
  const images: ImageXObjectView[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) {
      continue;
    }
    const subtype = obj.dict.get(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') {
      continue;
    }
    const filter = readFilter(obj.dict);
    images.push({
      dict: obj.dict,
      width: readNumber(obj.dict, 'Width'),
      height: readNumber(obj.dict, 'Height'),
      colorSpace: readColorSpace(obj.dict),
      filterForm: filter.form,
      filterNames: filter.names,
      contentLength: obj.getContents().length,
      contents: obj.getContents(),
    });
  }
  return { doc, images };
}

describe('dctPdfBuilder fixtures', () => {
  it('produces a PDF that reloads as a valid single-page document (a)', async () => {
    const fixture = await buildDctPdf({
      width: 1200,
      height: 1500,
      content: 'noise',
      quality: 75,
    });

    const { doc, images } = await loadFixture(fixture.bytes);

    expect(doc.getPageCount()).toBe(1);
    expect(images).toHaveLength(1);
    expect(images[0].width).toBe(fixture.expected.width);
    expect(images[0].height).toBe(fixture.expected.height);
    // Default filter form is the bare PDFName /DCTDecode (embedJpg native).
    expect(images[0].filterForm).toBe('name');
    expect(images[0].filterNames).toEqual(['/DCTDecode']);
  });

  it('eligible fixture exceeds BOTH eligibility thresholds (b)', async () => {
    const fixture = await buildDctPdf({
      width: 2480,
      height: 3456,
      content: 'noise',
      quality: 75,
    });

    const { images } = await loadFixture(fixture.bytes);

    expect(images).toHaveLength(1);
    const scan = images[0];
    expect(Math.max(scan.width, scan.height)).toBeGreaterThanOrEqual(
      PDF_IMAGE_MIN_LONGEST_SIDE_PX,
    );
    expect(scan.contentLength).toBeGreaterThanOrEqual(
      PDF_IMAGE_MIN_DCT_STREAM_BYTES,
    );
  });

  it('px-ineligible fixture (700x700 noise) sits under the px threshold (c)', async () => {
    const fixture = await buildDctPdf({
      width: 700,
      height: 700,
      content: 'noise',
      quality: 75,
    });

    const { images } = await loadFixture(fixture.bytes);

    expect(images).toHaveLength(1);
    expect(Math.max(images[0].width, images[0].height)).toBeLessThan(
      PDF_IMAGE_MIN_LONGEST_SIDE_PX,
    );
  });

  it('bytes-ineligible fixture (flat q75) keeps eligible px but a tiny stream (d)', async () => {
    const fixture = await buildDctPdf({
      width: 1200,
      height: 1500,
      content: 'flat',
      quality: 75,
    });

    const { images } = await loadFixture(fixture.bytes);

    expect(images).toHaveLength(1);
    expect(Math.max(images[0].width, images[0].height)).toBeGreaterThanOrEqual(
      PDF_IMAGE_MIN_LONGEST_SIDE_PX,
    );
    expect(images[0].contentLength).toBeLessThan(PDF_IMAGE_MIN_DCT_STREAM_BYTES);
  });

  it('corrupt fixture is a valid PDF whose eligible stream is SOI + garbage sharp cannot decode (e)', async () => {
    const fixture = await buildDctPdf({
      width: 1240,
      height: 1728,
      content: 'noise',
      quality: 75,
      corrupt: true,
    });

    const { images } = await loadFixture(fixture.bytes);

    expect(images).toHaveLength(1);
    const corruptImage = images[0];
    expect(corruptImage.width).toBe(fixture.expected.width);
    expect(corruptImage.height).toBe(fixture.expected.height);
    // Threshold-eligible on purpose: I6 needs a corrupt stream that the
    // adapter will ATTEMPT to re-encode before sharp rejects it.
    expect(corruptImage.contentLength).toBeGreaterThanOrEqual(
      PDF_IMAGE_MIN_DCT_STREAM_BYTES,
    );
    expect(
      Buffer.from(corruptImage.contents.subarray(0, JPEG_SOI.length)),
    ).toEqual(JPEG_SOI);
    // The real decode path the adapter uses must genuinely fail.
    await expect(sharp(Buffer.from(corruptImage.contents)).toBuffer()).rejects.toThrow();
  });

  it('SMask fixture carries a real gray SMask XObject under /SMask (e)', async () => {
    const fixture = await buildDctPdf({
      width: 1200,
      height: 1500,
      content: 'noise',
      quality: 75,
      withSMask: true,
    });

    const { doc, images } = await loadFixture(fixture.bytes);

    // The fixture carries 3 image XObjects by design: the main DCT image,
    // the unused RGB host from embedPng, and the gray SMask itself.
    const dctImages = images.filter((img) => img.filterNames.includes('/DCTDecode'));
    expect(dctImages).toHaveLength(1);
    expect(images.some((img) => img.colorSpace === '/DeviceGray')).toBe(true);

    const smaskRef = dctImages[0].dict.get(PDFName.of('SMask'));
    expect(smaskRef).toBeInstanceOf(PDFRef);
    if (!(smaskRef instanceof PDFRef)) {
      return;
    }
    const smaskStream = doc.context.lookup(smaskRef);
    expect(smaskStream).toBeInstanceOf(PDFRawStream);
    if (!(smaskStream instanceof PDFRawStream)) {
      return;
    }
    const subtype = smaskStream.dict.get(PDFName.of('Subtype'));
    expect(subtype).toBeInstanceOf(PDFName);
    const colorSpace = smaskStream.dict.get(PDFName.of('ColorSpace'));
    expect(colorSpace).toBeInstanceOf(PDFName);
    if (subtype instanceof PDFName && colorSpace instanceof PDFName) {
      expect(subtype.asString()).toBe('/Image');
      expect(colorSpace.asString()).toBe('/DeviceGray');
    }
  });

  it('colorspace variants embed CMYK and gray DCT images with matching dicts (e)', async () => {
    const cmyk = await buildDctPdf({
      width: 800,
      height: 600,
      content: 'flat',
      quality: 75,
      colorspace: 'cmyk',
    });
    const gray = await buildDctPdf({
      width: 800,
      height: 600,
      content: 'flat',
      quality: 75,
      colorspace: 'gray',
    });

    const cmykLoaded = await loadFixture(cmyk.bytes);
    const grayLoaded = await loadFixture(gray.bytes);

    expect(cmykLoaded.images).toHaveLength(1);
    expect(cmykLoaded.images[0].colorSpace).toBe('/DeviceCMYK');
    expect(grayLoaded.images).toHaveLength(1);
    expect(grayLoaded.images[0].colorSpace).toBe('/DeviceGray');
  });

  it('filter-form variants rewrite the Filter entry exactly as requested (e)', async () => {
    const asArray = await buildDctPdf({
      width: 400,
      height: 300,
      content: 'flat',
      quality: 75,
      filterForm: 'array',
    });
    const asMulti = await buildDctPdf({
      width: 400,
      height: 300,
      content: 'flat',
      quality: 75,
      filterForm: 'multi',
    });

    const arrayLoaded = await loadFixture(asArray.bytes);
    const multiLoaded = await loadFixture(asMulti.bytes);

    expect(arrayLoaded.images).toHaveLength(1);
    expect(arrayLoaded.images[0].filterForm).toBe('array');
    expect(arrayLoaded.images[0].filterNames).toEqual(['/DCTDecode']);

    expect(multiLoaded.images).toHaveLength(1);
    expect(multiLoaded.images[0].filterForm).toBe('array');
    expect(multiLoaded.images[0].filterNames).toEqual([
      '/FlateDecode',
      '/DCTDecode',
    ]);
  });
});
