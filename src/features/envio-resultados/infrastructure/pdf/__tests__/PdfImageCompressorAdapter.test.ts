import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFImage,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';
import sharp from 'sharp';

import { PdfImageCompressorAdapter } from '../PdfImageCompressorAdapter';
import {
  PDF_IMAGE_JPEG_QUALITY,
  PDF_IMAGE_MIN_DCT_STREAM_BYTES,
  PDF_IMAGE_MIN_LONGEST_SIDE_PX,
} from '../constants';
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
 * The eligibility/preservation matrix (I2/I3/I5/I5b/I13/I14) pins the
 * thresholds, filter forms, SMask preservation and JPX skipping; this
 * batch completes the matrix with the CMYK re-encode (I4), the per-image
 * fail-open on a corrupt stream (I6), the fail-open family (I8–I12) and
 * the metadata-preservation divergence (I15).
 *
 * Multi-image fixtures (I2/I5b/I13/I14) are composed test-side with REAL
 * sharp noise JPEGs — the builder emits single-image PDFs only. Every
 * composed fixture pre-asserts its eligibility facts, so a silent encoder
 * change fails loudly in the fixture guard instead of voiding a test's
 * premise.
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

  /** Gaussian parameters of the builder's 'noise' recipe, replicated for
   * the test-side multi-image composer (the builder keeps them private). */
  const NOISE_JPEG_MEAN = 128;
  const NOISE_JPEG_SIGMA = 30;

  /**
   * Encodes a real gaussian-noise JPEG with sharp — the same recipe the
   * builder uses for `content: 'noise'` — so multi-image fixtures can be
   * composed test-side with the same eligible/ineligible physics.
   */
  async function encodeNoiseJpeg(options: {
    width: number;
    height: number;
    quality?: number;
  }): Promise<Buffer> {
    const { width, height, quality = PDF_IMAGE_JPEG_QUALITY } = options;
    return Buffer.from(
      await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
          noise: { type: 'gaussian', mean: NOISE_JPEG_MEAN, sigma: NOISE_JPEG_SIGMA },
        },
      })
        .jpeg({ quality })
        .toBuffer(),
    );
  }

  /**
   * Exact-backing-store view for pdf-lib EMBEDDER handoffs (`embedJpg`).
   * Unlike the load-only `asUint8ArrayView` above, pdf-lib's embedders
   * parse the view's WHOLE backing ArrayBuffer ignoring `byteOffset`, and
   * small sharp outputs live in Node's shared buffer pool — so this view
   * ALWAYS copies, guaranteeing the ArrayBuffer holds exactly the bytes.
   */
  function asEmbedBytes(bytes: Buffer): Uint8Array {
    return new Uint8Array(bytes);
  }

  /** The image XObject stream under an indirect reference, or throws. */
  function requireRawStream(doc: PDFDocument, ref: PDFRef): PDFRawStream {
    const obj = doc.context.lookup(ref);
    if (!(obj instanceof PDFRawStream)) {
      throw new Error(`Expected a PDFRawStream under indirect reference ${String(ref)}`);
    }
    return obj;
  }

  /** Buffer copy of an image stream's raw contents. */
  function streamBytesOf(stream: PDFRawStream): Buffer {
    return Buffer.from(stream.getContents());
  }

  /** The image XObject whose dict reports the given /Width, or throws. */
  function requireImageByWidth(doc: PDFDocument, width: number): PDFRawStream {
    const found = findImageDicts(doc).find(
      (image) => numberFrom(image.dict, 'Width') === width,
    );
    if (found === undefined) {
      throw new Error(`Expected an image XObject with /Width ${width}`);
    }
    return found;
  }

  /** True when the stream dict declares DCTDecode as its sole filter —
   * mirrors the adapter's own eligibility gate (design §3.2 D5). */
  function isDctImage(image: PDFRawStream): boolean {
    const filter = image.dict.get(PDFName.of('Filter'));
    if (filter instanceof PDFName) {
      return filter.asString() === '/DCTDecode';
    }
    if (filter instanceof PDFArray) {
      if (filter.size() !== 1) {
        return false;
      }
      const only = filter.get(0);
      return only instanceof PDFName && only.asString() === '/DCTDecode';
    }
    return false;
  }

  /** The single DCTDecode image XObject, or throws. In the builder's
   * SMask variant BOTH the DCT image and the RGB PNG host carry /SMask
   * entries pointing at the SAME gray mask (the host's own alpha split),
   * so SMask presence cannot identify the DCT — its filter can. */
  function requireDctImage(doc: PDFDocument): PDFRawStream {
    const found = findImageDicts(doc).filter(isDctImage);
    if (found.length !== 1) {
      throw new Error(`Expected exactly one DCTDecode image XObject, found ${found.length}`);
    }
    return found[0];
  }

  /**
   * Fixture self-guard: asserts an image clears BOTH eligibility gates so
   * a silent encoder change (e.g. smaller noise JPEGs) fails loudly here
   * instead of voiding a test's premise.
   */
  function expectEligible(stream: PDFRawStream): void {
    const width = numberFrom(stream.dict, 'Width') ?? 0;
    const height = numberFrom(stream.dict, 'Height') ?? 0;
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(PDF_IMAGE_MIN_LONGEST_SIDE_PX);
    expect(streamBytesOf(stream).length).toBeGreaterThanOrEqual(PDF_IMAGE_MIN_DCT_STREAM_BYTES);
  }

  /** One embedded noise JPEG in a composed multi-image fixture. */
  interface NoiseImageSpec {
    width: number;
    height: number;
    quality?: number;
  }

  interface ComposedNoisePdf {
    /** The live document — already flush-saved, safe for post-flush dict surgery. */
    doc: PDFDocument;
    page: PDFPage;
    /** Embedded images in spec order (their refs feed dict surgery). */
    images: PDFImage[];
    /** Serializes the CURRENT context — call after any post-flush surgery. */
    save(): Promise<Buffer>;
  }

  /**
   * Composes a single-page PDF embedding one REAL noise JPEG per spec.
   * A first save() flushes the embedders (embedJpg only reserves refs —
   * the streams land in the context during save), so callers may mutate
   * image dicts afterwards (SMask/filter surgery) and then call save()
   * for the final bytes.
   */
  async function composeNoisePdf(specs: NoiseImageSpec[]): Promise<ComposedNoisePdf> {
    if (specs.length === 0) {
      throw new Error('composeNoisePdf requires at least one image spec');
    }
    const doc = await PDFDocument.create();
    const page = doc.addPage([specs[0].width, specs[0].height]);
    const images: PDFImage[] = [];
    let yOffset = 0;
    for (const spec of specs) {
      const jpeg = await encodeNoiseJpeg(spec);
      const image = await doc.embedJpg(asEmbedBytes(jpeg));
      page.drawImage(image, { x: 0, y: yOffset, width: spec.width, height: spec.height });
      images.push(image);
      yOffset += 100;
    }
    await doc.save(); // flush embedders — refs now resolve to real streams
    return {
      doc,
      page,
      images,
      save: async () => Buffer.from(await doc.save()),
    };
  }

  describe('I2 — icon (<1000px) untouched beside a compressed scan', () => {
    it('leaves a 400×400 DCT icon byte-identical while the eligible 2480×3456 scan shrinks', async () => {
      const { save } = await composeNoisePdf([
        { width: 2480, height: 3456 }, // eligible scan (default q75)
        { width: 400, height: 400 }, // icon: the px gate alone excludes it
      ]);
      const input = await save();
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expectEligible(requireImageByWidth(inputDoc, 2480));
      const iconBytes = streamBytesOf(requireImageByWidth(inputDoc, 400));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // A clean re-encode must not trip the fail-open warning (I1's row
      // contract, reused for every success-path scenario in this batch).
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(findImageDicts(reloaded)).toHaveLength(2);

      // The scan was re-encoded to its halved dimensions…
      const scan = requireImageByWidth(reloaded, 1240);
      expect(numberFrom(scan.dict, 'Height')).toBe(1728);

      // …while the icon's dict and stream are untouched, byte for byte.
      const icon = requireImageByWidth(reloaded, 400);
      expect(numberFrom(icon.dict, 'Height')).toBe(400);
      expect(Buffer.compare(streamBytesOf(icon), iconBytes)).toBe(0);
    }, 60_000);
  });

  describe('I3 — JPXDecode image skipped', () => {
    it('leaves a dimension- and size-eligible JPXDecode stream untouched while a DCT scan beside it shrinks', async () => {
      const { doc, page, save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 },
      ]);
      // The builder cannot produce JPX (its filterForm only rewrites DCT
      // forms), so the JPX-marked dict is constructed manually. The stream
      // bytes are deterministic filler — safe because surgery never decodes
      // skipped images (same rationale as the builder's 'multi' form). The
      // dict is deliberately ELIGIBLE by dimensions and stream size so ONLY
      // the /JPXDecode filter can exclude it.
      const jpxBytes = new Uint8Array(PDF_IMAGE_MIN_DCT_STREAM_BYTES + 4096).fill(0x7f);
      const jpxDict = doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: 2480,
        Height: 3456,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'JPXDecode',
      });
      const jpxRef = doc.context.register(PDFRawStream.of(jpxDict, jpxBytes));
      page.node.setXObject(PDFName.of('ImJpx'), jpxRef);
      const input = await save();

      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expect(findImageDicts(inputDoc)).toHaveLength(2);
      expectEligible(requireImageByWidth(inputDoc, 1200)); // the scan is eligible…
      const jpxSnapshot = streamBytesOf(requireImageByWidth(inputDoc, 2480));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(findImageDicts(reloaded)).toHaveLength(2);

      // …and was re-encoded, proving the loop continues past skipped images.
      const scan = requireImageByWidth(reloaded, 600);
      expect(numberFrom(scan.dict, 'Height')).toBe(700);

      // The JPX stream survives untouched, byte for byte.
      const jpx = requireImageByWidth(reloaded, 2480);
      expect(numberFrom(jpx.dict, 'Height')).toBe(3456);
      expect(Buffer.compare(streamBytesOf(jpx), jpxSnapshot)).toBe(0);
    }, 60_000);
  });

  describe('I5 — SMask preserved on an eligible DCT image', () => {
    it('re-encodes the image while keeping the /SMask reference and the mask stream byte-identical', async () => {
      // The builder's alpha-PNG variant yields THREE image XObjects: the
      // main DCT image, the RGB PNG host left by embedPng's alpha split
      // (never wired to the page contents), and the gray mask. BOTH the
      // DCT image and the host carry /SMask entries pointing at the same
      // mask, so assertions target the DCT via its DCTDecode filter.
      const { bytes: input } = await buildDctPdf({
        width: 2480,
        height: 3456,
        content: 'noise',
        withSMask: true,
      });
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expect(findImageDicts(inputDoc)).toHaveLength(3);
      const dct = requireDctImage(inputDoc);
      expectEligible(dct);
      const dctSnapshot = streamBytesOf(dct);
      const maskRef = dct.dict.get(PDFName.of('SMask'));
      if (!(maskRef instanceof PDFRef)) {
        throw new Error('fixture DCT image carries no /SMask ref');
      }
      const maskSnapshot = streamBytesOf(requireRawStream(inputDoc, maskRef));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(findImageDicts(reloaded)).toHaveLength(3);

      // The DCT image was re-encoded (halved dimensions, smaller stream)…
      const dctOutput = requireDctImage(reloaded);
      expect(numberFrom(dctOutput.dict, 'Width')).toBe(1240);
      expect(numberFrom(dctOutput.dict, 'Height')).toBe(1728);
      expect(streamBytesOf(dctOutput).length).toBeLessThan(dctSnapshot.length);

      // …its /SMask entry survived surgery pointing at the SAME indirect
      // reference, and the referenced mask stream is byte-identical —
      // transparency intact (spec RF1 "SMask preserved").
      const maskRefOutput = dctOutput.dict.get(PDFName.of('SMask'));
      if (!(maskRefOutput instanceof PDFRef)) {
        throw new Error('re-encoded DCT image lost its /SMask ref');
      }
      expect(maskRefOutput.objectNumber).toBe(maskRef.objectNumber);
      expect(
        Buffer.compare(streamBytesOf(requireRawStream(reloaded, maskRefOutput)), maskSnapshot),
      ).toBe(0);
    }, 60_000);
  });

  describe('I5b — a DCT image that IS an SMask is excluded from surgery', () => {
    it('returns byte-identical bytes because the only eligible image is referenced as another image\'s /SMask', async () => {
      const { doc, images, save } = await composeNoisePdf([
        { width: 800, height: 800, quality: 100 }, // host: px-ineligible
        { width: 1200, height: 1400, quality: 100 }, // scan: eligible…
      ]);
      // …until it becomes the host's /SMask target (post-flush surgery).
      const [host, scan] = images;
      requireRawStream(doc, host.ref).dict.set(PDFName.of('SMask'), scan.ref);
      const input = await save();

      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      // Fixture guard: the masked scan clears BOTH size gates — pass 1's
      // exclusion set is the ONLY thing standing between it and surgery.
      expectEligible(requireImageByWidth(inputDoc, 1200));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // Pass 1 excludes the scan (it is the host's /SMask target) and the
      // host fails the px gate — so ZERO images were re-encoded and the
      // no-op contract returns the ORIGINAL bytes with no save() and no
      // skippedReason. This byte-identity is the decisive exclusion
      // evidence: without the pass-1 exclusion set, the eligible scan
      // would re-encode, trigger save(), and yield different (smaller)
      // bytes.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(Buffer.compare(result.bytes, input)).toBe(0);
    }, 60_000);
  });

  describe('I13 — filter-form matrix', () => {
    it('compresses bare-name and [/DCTDecode] images and leaves a [/FlateDecode,/DCTDecode] chain untouched', async () => {
      // All three images clear BOTH size gates; only the /Filter form
      // differs. The multi-form bytes are left unwrapped exactly like the
      // builder's 'multi' fixture — surgery never decodes skipped images.
      const { doc, images, save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 }, // bare /DCTDecode name
        { width: 1200, height: 1400, quality: 100 }, // rewritten to [/DCTDecode]
        { width: 1200, height: 1400, quality: 100 }, // rewritten to the flate+dct chain
      ]);
      const [, arrayImage, multiImage] = images;
      requireRawStream(doc, arrayImage.ref).dict.set(
        PDFName.of('Filter'),
        doc.context.obj(['DCTDecode']),
      );
      requireRawStream(doc, multiImage.ref).dict.set(
        PDFName.of('Filter'),
        doc.context.obj(['FlateDecode', 'DCTDecode']),
      );
      const input = await save();

      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      const inputImages = findImageDicts(inputDoc);
      expect(inputImages).toHaveLength(3);
      for (const image of inputImages) {
        expectEligible(image); // loop runs: length asserted first
      }
      const multiInputs = inputImages.filter((image) => {
        const filter = image.dict.get(PDFName.of('Filter'));
        return filter instanceof PDFArray && filter.size() === 2;
      });
      expect(multiInputs).toHaveLength(1);
      const multiSnapshot = streamBytesOf(multiInputs[0]);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      const outputImages = findImageDicts(reloaded);
      expect(outputImages).toHaveLength(3);

      // Bare /DCTDecode name → compressed to 600×700.
      const bareOutputs = outputImages.filter(
        (image) => image.dict.get(PDFName.of('Filter')) instanceof PDFName,
      );
      expect(bareOutputs).toHaveLength(1);
      expect(numberFrom(bareOutputs[0].dict, 'Width')).toBe(600);
      expect(numberFrom(bareOutputs[0].dict, 'Height')).toBe(700);

      // [/DCTDecode] single-element array → compressed too (adapter keeps
      // /Filter untouched, so the array form survives surgery).
      const arrayOutputs = outputImages.filter((image) => {
        const filter = image.dict.get(PDFName.of('Filter'));
        return filter instanceof PDFArray && filter.size() === 1;
      });
      expect(arrayOutputs).toHaveLength(1);
      expect(numberFrom(arrayOutputs[0].dict, 'Width')).toBe(600);
      expect(numberFrom(arrayOutputs[0].dict, 'Height')).toBe(700);

      // [/FlateDecode,/DCTDecode] multi-codec chain → untouched: dims and
      // stream bytes identical (conservative skip is always safe, D5).
      const multiOutputs = outputImages.filter((image) => {
        const filter = image.dict.get(PDFName.of('Filter'));
        return filter instanceof PDFArray && filter.size() === 2;
      });
      expect(multiOutputs).toHaveLength(1);
      expect(numberFrom(multiOutputs[0].dict, 'Width')).toBe(1200);
      expect(numberFrom(multiOutputs[0].dict, 'Height')).toBe(1400);
      expect(Buffer.compare(streamBytesOf(multiOutputs[0]), multiSnapshot)).toBe(0);
    }, 60_000);
  });

  describe('I14 — threshold edges (exact px boundary)', () => {
    it('skips a 999px-longest-side image and compresses a 1000px one when both clear the bytes gate', async () => {
      const { save } = await composeNoisePdf([
        { width: 999, height: 999, quality: 100 }, // longest side 999 < 1000
        { width: 1000, height: 1000, quality: 100 }, // exactly at the boundary
      ]);
      const input = await save();
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      const inputImages = findImageDicts(inputDoc);
      expect(inputImages).toHaveLength(2);
      // Size BOTH fixtures above the bytes threshold so the pixel gate is
      // the ONLY differentiator at the exact boundary. Thresholds are
      // referenced via the production constants — never magic numbers.
      for (const image of inputImages) {
        expect(streamBytesOf(image).length).toBeGreaterThanOrEqual(PDF_IMAGE_MIN_DCT_STREAM_BYTES);
      }
      const smallSnapshot = streamBytesOf(requireImageByWidth(inputDoc, 999));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // Exactly one image was re-encoded, so the file still shrank.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(findImageDicts(reloaded)).toHaveLength(2);

      // 1000px clears the gate (eligible iff longest side ≥ 1000) → 500×500.
      const big = requireImageByWidth(reloaded, 500);
      expect(numberFrom(big.dict, 'Height')).toBe(500);

      // 999px misses it by exactly one pixel → dict and stream untouched.
      const small = requireImageByWidth(reloaded, 999);
      expect(numberFrom(small.dict, 'Height')).toBe(999);
      expect(Buffer.compare(streamBytesOf(small), smallSnapshot)).toBe(0);
    }, 60_000);
  });

  describe('I4 — CMYK scan re-encoded to sRGB', () => {
    it('re-encodes an eligible DeviceCMYK DCT scan into /DeviceRGB and deletes stale decode hints', async () => {
      // Primary recipe per design §6: a REAL libvips CMYK JPEG (the PR2
      // smoke suite proved real CMYK JPEGs embed cleanly through the
      // builder), so the dict-level synthetic fallback stays unused.
      const { bytes: built } = await buildDctPdf({
        width: 2480,
        height: 3456,
        content: 'noise',
        colorspace: 'cmyk',
      });
      // Post-flush dict surgery (same test-side pattern as I5b/I3): the
      // builder cannot attach Adobe-style decode hints, so stale
      // /DecodeParms and /Decode are injected here to prove D5 DELETES
      // them on re-encode (a stale /ColorTransform 0 or an inverted
      // /Decode would corrupt the re-encoded image).
      const surgeryDoc = await PDFDocument.load(asUint8ArrayView(built), {
        updateMetadata: false,
      });
      const dct = requireDctImage(surgeryDoc);
      expectEligible(dct);
      // Fixture guard: the input is genuinely CMYK before surgery.
      const inputColorSpace = dct.dict.get(PDFName.of('ColorSpace'));
      if (!(inputColorSpace instanceof PDFName)) {
        throw new Error('fixture CMYK image dict has no /ColorSpace name');
      }
      expect(inputColorSpace.asString()).toBe('/DeviceCMYK');
      dct.dict.set(
        PDFName.of('DecodeParms'),
        surgeryDoc.context.obj({ ColorTransform: 0 }),
      );
      dct.dict.set(PDFName.of('Decode'), surgeryDoc.context.obj([1, 0, 1, 0, 1, 0]));
      const input = Buffer.from(await surgeryDoc.save());
      const inputSnapshot = streamBytesOf(dct);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // Success row: the CMYK scan re-encoded cleanly, no fail-open.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      // Exactly one DCTDecode image — its /Filter survived surgery.
      const outputImage = requireDctImage(reloaded);
      expect(numberFrom(outputImage.dict, 'Width')).toBe(1240);
      expect(numberFrom(outputImage.dict, 'Height')).toBe(1728);
      expect(numberFrom(outputImage.dict, 'BitsPerComponent')).toBe(8);

      // Unconditional sRGB rewrite (D5): the dict now says /DeviceRGB…
      const outputColorSpace = outputImage.dict.get(PDFName.of('ColorSpace'));
      if (!(outputColorSpace instanceof PDFName)) {
        throw new Error('re-encoded image dict lost its /ColorSpace name');
      }
      expect(outputColorSpace.asString()).toBe('/DeviceRGB');

      // …and the stale decode hints are GONE (they were in the input).
      expect(outputImage.dict.get(PDFName.of('DecodeParms'))).toBeUndefined();
      expect(outputImage.dict.get(PDFName.of('Decode'))).toBeUndefined();

      // The stream is the smaller sRGB re-encode, not the CMYK original.
      expect(streamBytesOf(outputImage).length).toBeLessThan(inputSnapshot.length);
    }, 60_000);
  });

  describe('I6 — corrupt DCT stream fails open per image', () => {
    it('keeps the corrupt stream byte-identical, compresses the scan beside it, and warns without throwing', async () => {
      const { doc, page, save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 }, // eligible scan
      ]);
      // The builder is single-image, so the corrupt stream is attached
      // test-side with the builder's own corrupt recipe: a JPEG SOI
      // marker followed by deterministic garbage (proven sharp-
      // undecodable by dctPdfBuilder.smoke.test.ts), sized above the
      // bytes threshold so the stream actually reaches the decode step.
      const corruptBytes = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // JPEG SOI
        Buffer.alloc(PDF_IMAGE_MIN_DCT_STREAM_BYTES + 1024 - 2, 0x5a),
      ]);
      const corruptDict = doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: 2480,
        Height: 3456,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
      });
      const corruptRef = doc.context.register(
        PDFRawStream.of(corruptDict, new Uint8Array(corruptBytes)),
      );
      page.node.setXObject(PDFName.of('ImCorrupt'), corruptRef);
      const input = await save();

      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expect(findImageDicts(inputDoc)).toHaveLength(2);
      expectEligible(requireImageByWidth(inputDoc, 1200));
      // The corrupt image clears BOTH size gates too — only the garbage
      // CONTENT can fail the pipeline (per-image fail-open, not
      // eligibility).
      expectEligible(requireImageByWidth(inputDoc, 2480));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input); // must not throw

      // File-level row stays SUCCESS (error map: per-image fail-open does
      // not mark the file) and the scan's savings survive (best-of).
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      // Exactly one warn — the per-image skip, carrying the corrupt ref.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PdfImageCompressorAdapter] image skipped',
        expect.objectContaining({ ref: String(corruptRef), error: expect.any(String) }),
      );

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(findImageDicts(reloaded)).toHaveLength(2);

      // The healthy scan was re-encoded…
      const scan = requireImageByWidth(reloaded, 600);
      expect(numberFrom(scan.dict, 'Height')).toBe(700);

      // …while the corrupt image kept its dict and bytes, byte for byte.
      const corrupt = requireImageByWidth(reloaded, 2480);
      expect(numberFrom(corrupt.dict, 'Height')).toBe(3456);
      expect(Buffer.compare(streamBytesOf(corrupt), corruptBytes)).toBe(0);
    }, 60_000);
  });

  describe('I15 — document metadata preserved (divergence vs the lossless adapter)', () => {
    it('keeps title/author/subject/keywords/producer/creator through the re-encode', async () => {
      const { bytes: built } = await buildDctPdf({
        width: 2480,
        height: 3456,
        content: 'noise',
      });
      const metadataDoc = await PDFDocument.load(asUint8ArrayView(built), {
        updateMetadata: false,
      });
      metadataDoc.setTitle('EMO Consolidado 2026-09');
      metadataDoc.setAuthor('Holomedic');
      metadataDoc.setSubject('Clinical archive export');
      metadataDoc.setKeywords(['holomedic', 'consolidado']);
      metadataDoc.setProducer('HolomedicPACS 3.1');
      metadataDoc.setCreator('HolomedicWeb 2.0');
      // Capture the ACTUAL stored strings — pdf-lib hex-encodes Info text
      // and joins keyword arrays its own way, so comparing the captured
      // getters avoids coupling to those encoding formats.
      const expectedMetadata = {
        title: metadataDoc.getTitle(),
        author: metadataDoc.getAuthor(),
        subject: metadataDoc.getSubject(),
        keywords: metadataDoc.getKeywords(),
        producer: metadataDoc.getProducer(),
        creator: metadataDoc.getCreator(),
      };
      const input = Buffer.from(await metadataDoc.save());
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      // The scan genuinely re-encoded — the preservation is not vacuous.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);
      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      expect(numberFrom(requireImageByWidth(reloaded, 1240).dict, 'Height')).toBe(1728);

      // The image adapter does NOT strip metadata (design §3.2 D-note):
      // every Info-dict entry survives surgery. The LOSSLESS adapter
      // empties exactly these fields (its test A5) — the deliberate
      // divergence between the two profiles.
      expect(reloaded.getTitle()).toBe(expectedMetadata.title);
      expect(reloaded.getAuthor()).toBe(expectedMetadata.author);
      expect(reloaded.getSubject()).toBe(expectedMetadata.subject);
      expect(reloaded.getKeywords()).toBe(expectedMetadata.keywords);
      expect(reloaded.getProducer()).toBe(expectedMetadata.producer);
      expect(reloaded.getCreator()).toBe(expectedMetadata.creator);
    }, 60_000);
  });

  /**
   * Injects `/Encrypt 1 0 R` into the dict of the LAST indirect object —
   * always the XRef stream in a pdf-lib save — reproducing an encrypted
   * PDF at load time. Same pattern as the lossless suite (its test A4).
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

  describe('I9 — encrypted PDF fails open (encrypted)', () => {
    it('resolves with the original bytes and logs the classified warning (never throws)', async () => {
      // Any structurally valid pdf-lib-saved PDF works: /Encrypt trips at
      // PDFDocument.load, before sharp or the eligibility gates ever run.
      const { bytes: built } = await buildDctPdf({
        width: 1200,
        height: 1500,
        content: 'flat',
      });
      const input = injectEncryptEntry(built);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBe('encrypted');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PdfImageCompressorAdapter] fail-open',
        expect.objectContaining({ reason: 'encrypted', sizeBytes: input.length }),
      );
    });
  });

  describe('I10 — non-PDF bytes fail open (parse-error)', () => {
    it('resolves with the original bytes and logs the classified warning (never throws)', async () => {
      const input = Buffer.from('not a pdf');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await adapter.compress(input);

      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBe('parse-error');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PdfImageCompressorAdapter] fail-open',
        expect.objectContaining({ reason: 'parse-error', sizeBytes: input.length }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Module-mock plumbing (I8/I11/I12 — design §6: vi.mock('sharp'); vitest
  // intercepts the adapter's DYNAMIC import).
  //
  // The adapter module caches its sharp import promise at module scope, so a
  // mock must be observed by a FRESH adapter module instance: each mocked
  // test registers the mock with vi.doMock, resets the module registry, and
  // re-imports the adapter. The file's statically imported adapter class and
  // the test file's REAL sharp (used for every fixture) keep their original
  // bindings, so the earlier tests are untouched. Each mocked describe
  // unmocks and resets again in its afterEach.
  // ---------------------------------------------------------------------------

  /** Result shape the adapter destructures from the stubbed toBuffer(). */
  interface SharpStubResult {
    data: Buffer;
    info: { width: number; height: number };
  }

  /** Minimal chainable shape of the `sharp(input)` factory's pipeline. */
  interface SharpStubPipeline {
    rotate(): SharpStubPipeline;
    resize(): SharpStubPipeline;
    toColorspace(): SharpStubPipeline;
    jpeg(): SharpStubPipeline;
    toBuffer(): Promise<SharpStubResult>;
  }

  /**
   * Builds a `sharp(input)` factory stub that records the stream length the
   * adapter hands it and resolves `toBuffer` through `resolve` (which may
   * return a never-resolving promise to stall the pipeline).
   */
  function makeSharpFactoryStub(resolve: (streamBytesLength: number) => Promise<SharpStubResult>): {
    factory: (input: Buffer) => SharpStubPipeline;
    seenStreamBytes(): number | undefined;
  } {
    let seen: number | undefined;
    const factory = (input: Buffer): SharpStubPipeline => {
      seen = input.length;
      const pipeline: SharpStubPipeline = {
        rotate: () => pipeline,
        resize: () => pipeline,
        toColorspace: () => pipeline,
        jpeg: () => pipeline,
        toBuffer: () => resolve(input.length),
      };
      return pipeline;
    };
    return { factory, seenStreamBytes: () => seen };
  }

  /** Registers `moduleShape` as the 'sharp' module mock and returns a FRESH
   * adapter class from a reset module registry (see the block comment). */
  async function importAdapterWithSharpMock(moduleShape: { default: unknown }): Promise<
    typeof PdfImageCompressorAdapter
  > {
    vi.doMock('sharp', () => moduleShape);
    vi.resetModules();
    return (await import('../PdfImageCompressorAdapter')).PdfImageCompressorAdapter;
  }

  describe('I8 — per-image best-of (mocked sharp pipeline)', () => {
    afterEach(() => {
      vi.doUnmock('sharp');
      vi.resetModules();
    });

    it('keeps the original stream and returns byte-identical bytes when the mock re-encode is larger', async () => {
      const { save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 },
      ]);
      const input = await save();
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expectEligible(requireImageByWidth(inputDoc, 1200));
      const originalStream = streamBytesOf(requireImageByWidth(inputDoc, 1200));
      const stub = makeSharpFactoryStub(async (streamBytesLength) => ({
        data: Buffer.alloc(streamBytesLength + 4096, 0x11), // oversized re-encode
        info: { width: 10, height: 10 },
      }));
      const FreshAdapter = await importAdapterWithSharpMock({ default: stub.factory });
      const mockedAdapter = new FreshAdapter();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await mockedAdapter.compress(input);

      // The stub pipeline RAN — the eligible stream actually reached sharp
      // (no vacuous green from an eligibility miss).
      expect(stub.seenStreamBytes()).toBe(originalStream.length);

      // Per-image best-of rejected the oversized re-encode (error map:
      // 'row stays success') → ZERO images replaced → the D3 no-op
      // contract returns the ORIGINAL bytes with no save() and NO
      // skippedReason. Characterization note: the file-level 'grew'
      // passthrough (≥1 replacement + saved ≥ original) exists in the
      // adapter but is unreachable from a mocked pipeline — every ACCEPTED
      // replacement strictly shrinks its stream while the rest of the
      // document re-serializes deterministically. The user-visible
      // guarantee pinned here is the invariant both branches serve: this
      // seam never returns bigger (or different) bytes.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);

      // The dict was untouched: no fake info (10×10) ever reached it and
      // the original stream is still there, byte for byte.
      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      const image = requireImageByWidth(reloaded, 1200);
      expect(numberFrom(image.dict, 'Height')).toBe(1400);
      expect(Buffer.compare(streamBytesOf(image), originalStream)).toBe(0);
    }, 60_000);

    it('accepts a smaller mock re-encode and writes its info dims into the dict', async () => {
      const { save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 },
      ]);
      const input = await save();
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expectEligible(requireImageByWidth(inputDoc, 1200));
      const originalStream = streamBytesOf(requireImageByWidth(inputDoc, 1200));
      const stub = makeSharpFactoryStub(async (streamBytesLength) => ({
        data: Buffer.alloc(streamBytesLength - 1024, 0x22), // smaller → accepted
        // Deliberately NOT the arithmetic halving (600×700): the dict must
        // report what sharp's info says, never arithmetic (design §3.2 D5).
        info: { width: 321, height: 701 },
      }));
      const FreshAdapter = await importAdapterWithSharpMock({ default: stub.factory });
      const mockedAdapter = new FreshAdapter();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await mockedAdapter.compress(input);

      expect(stub.seenStreamBytes()).toBe(originalStream.length);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBeUndefined();
      expect(result.outputBytes).toBeLessThan(result.originalBytes);

      const reloaded = await PDFDocument.load(asUint8ArrayView(result.bytes), {
        updateMetadata: false,
      });
      // The image is found by its NEW width: the mock's info reached the
      // dict, not the arithmetic halving.
      const image = requireImageByWidth(reloaded, 321);
      expect(numberFrom(image.dict, 'Height')).toBe(701);
      expect(numberFrom(image.dict, 'BitsPerComponent')).toBe(8);
      const colorspace = image.dict.get(PDFName.of('ColorSpace'));
      if (!(colorspace instanceof PDFName)) {
        throw new Error('re-encoded image dict lost its /ColorSpace name');
      }
      expect(colorspace.asString()).toBe('/DeviceRGB');
      // The stored stream IS the mock's data (1024 bytes smaller).
      expect(streamBytesOf(image).length).toBe(originalStream.length - 1024);
    }, 60_000);
  });

  describe('I11 — sharp module load failure fails open (parse-error)', () => {
    afterEach(() => {
      vi.doUnmock('sharp');
      vi.resetModules();
    });

    it('resolves with the original bytes, warns naming sharp, and recovers on the next call (cache cleared)', async () => {
      const { save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 },
      ]);
      const input = await save();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Phase 1 — the dynamic import of sharp itself rejects.
      vi.doMock('sharp', () => {
        throw new Error("Cannot find module 'sharp'");
      });
      vi.resetModules();
      const FreshAdapter = (await import('../PdfImageCompressorAdapter'))
        .PdfImageCompressorAdapter;
      const brokenAdapter = new FreshAdapter();

      const failed = await brokenAdapter.compress(input);

      expect(failed.method).toBe('pdf-lib-image-email');
      expect(failed.skippedReason).toBe('parse-error');
      expect(failed.originalBytes).toBe(input.length);
      expect(failed.outputBytes).toBe(input.length);
      expect(Buffer.compare(failed.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PdfImageCompressorAdapter] fail-open',
        expect.objectContaining({ reason: 'parse-error', sizeBytes: input.length }),
      );
      // The loader re-throws with a message that always names 'sharp' —
      // diagnosable regardless of the bundler's own error text (D4).
      const failPayload = warnSpy.mock.calls[0][1] as { error?: unknown };
      expect(String(failPayload.error)).toContain('sharp native module failed to load');

      // Phase 2 — a healthy module replaces the broken one: the loader
      // cleared its cached promise on failure, so THIS SAME adapter
      // instance retries the import and the pipeline recovers.
      const stub = makeSharpFactoryStub(async (streamBytesLength) => ({
        data: Buffer.alloc(streamBytesLength - 1024, 0x22),
        info: { width: 600, height: 700 },
      }));
      vi.doMock('sharp', () => ({ default: stub.factory }));
      expect(stub.seenStreamBytes()).toBeUndefined(); // nothing ran yet

      const recovered = await brokenAdapter.compress(input);

      expect(stub.seenStreamBytes()).toBeDefined(); // the retry reached sharp
      expect(recovered.method).toBe('pdf-lib-image-email');
      expect(recovered.skippedReason).toBeUndefined();
      expect(recovered.outputBytes).toBeLessThan(recovered.originalBytes);
      // Phase 1's warn is still the only fail-open warning on the file.
      expect(warnSpy).toHaveBeenCalledTimes(1);
    }, 60_000);
  });

  describe('I12 — stalled sharp pipeline fails open (timeout)', () => {
    afterEach(() => {
      vi.doUnmock('sharp');
      vi.resetModules();
    });

    it('preempts a never-resolving toBuffer with the original bytes and a timeout warning', async () => {
      const { save } = await composeNoisePdf([
        { width: 1200, height: 1400, quality: 100 },
      ]);
      const input = await save();
      const inputDoc = await PDFDocument.load(asUint8ArrayView(input), {
        updateMetadata: false,
      });
      expectEligible(requireImageByWidth(inputDoc, 1200)); // the pipeline is REACHED
      // Never-resolving toBuffer: the sharp work stays in flight while the
      // race guard's 25ms timer wins — a REAL preemption (sharp runs on
      // the libuv threadpool, design §3.2 D4), not the instant bail-out a
      // 0ms budget would produce before the pipeline even starts.
      const stub = makeSharpFactoryStub(() => new Promise<SharpStubResult>(() => {}));
      const FreshAdapter = await importAdapterWithSharpMock({ default: stub.factory });
      const impatient = new FreshAdapter(25);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await impatient.compress(input);

      expect(stub.seenStreamBytes()).toBeDefined(); // stalled inside the pipeline
      expect(result.method).toBe('pdf-lib-image-email');
      expect(result.skippedReason).toBe('timeout');
      expect(result.originalBytes).toBe(input.length);
      expect(result.outputBytes).toBe(input.length);
      expect(Buffer.compare(result.bytes, input)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[PdfImageCompressorAdapter] fail-open',
        expect.objectContaining({ reason: 'timeout', sizeBytes: input.length }),
      );
    }, 60_000);
  });
});
