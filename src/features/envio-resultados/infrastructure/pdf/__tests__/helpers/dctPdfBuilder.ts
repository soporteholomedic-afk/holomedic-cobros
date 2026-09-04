import { PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib';
import sharp from 'sharp';

import {
  PDF_IMAGE_JPEG_QUALITY,
  PDF_IMAGE_MIN_DCT_STREAM_BYTES,
} from '../../constants';

/**
 * In-test fixture builder for DCTDecode PDFs (spec RF8, design §6).
 *
 * Builds single-page in-RAM PDFs embedding a REAL sharp-generated JPEG
 * as a DCTDecode image XObject — the fixtures the email-profile adapter
 * tests operate on. No repo-tracked binaries, no mocks: every stream is
 * produced at test time.
 *
 * Fixture recipes (design §6):
 * - `content: 'noise'` — gaussian noise, the JPEG worst case. At ≥1000px
 *   and default quality the DCT stream exceeds
 *   `PDF_IMAGE_MIN_DCT_STREAM_BYTES` (eligible fixture).
 * - `content: 'flat'` — solid color, the JPEG best case. At ≥1000px and
 *   q75 the DCT stream stays far below the bytes threshold
 *   (bytes-ineligible fixture).
 * - `corrupt: true` — structurally valid PDF whose image dict claims
 *   DCTDecode with real dimensions, but the stream is a JPEG SOI marker
 *   followed by deterministic garbage that sharp cannot decode. Sized
 *   above `PDF_IMAGE_MIN_DCT_STREAM_BYTES` so the adapter's eligibility
 *   check PASSES and the corrupt bytes actually reach the decode step
 *   (the I6 per-image fail-open scenario).
 * - `withSMask: true` — embeds an RGBA PNG so pdf-lib's `embedPng`
 *   splits the alpha channel into a genuine gray `/SMask` XObject, then
 *   attaches that ref to the DCT image dict (the I5/I5b scenarios).
 * - `filterForm` — rewrites the dict `/Filter` entry after embedding:
 *   `'name'` (default, embedJpg native bare `/DCTDecode`), `'array'`
 *   (`[/DCTDecode]`), or `'multi'` (`[/FlateDecode,/DCTDecode]` — the
 *   multi-codec chain the adapter must skip; the bytes are intentionally
 *   left unwrapped since surgery never decodes skipped images).
 * - `colorspace: 'cmyk' | 'gray'` — encodes a real CMYK or grayscale
 *   JPEG via libvips; pdf-lib mirrors it into the dict as
 *   `/DeviceCMYK` or `/DeviceGray` (the I4 scenario).
 *
 * Every byte handed to a pdf-lib load/embed API goes through
 * `asUint8ArrayView` — under vitest's jsdom realm a raw Node Buffer
 * fails pdf-lib's `instanceof Uint8Array` validation.
 */

/** Pixel content of the generated JPEG. */
export type DctContent = 'noise' | 'flat';

/** JPEG colorspace, mirrored into the image dict's /ColorSpace entry. */
export type DctColorspace = 'srgb' | 'cmyk' | 'gray';

/** How the image dict declares its /Filter entry after embedding. */
export type DctFilterForm = 'name' | 'array' | 'multi';

export interface DctPdfBuilderOptions {
  /** Pixel width of the generated image (dict /Width). */
  width: number;
  /** Pixel height of the generated image (dict /Height). */
  height: number;
  /** 'noise' → huge JPEGs (eligible); 'flat' → tiny JPEGs (bytes-ineligible). */
  content: DctContent;
  /** JPEG quality. Defaults to the production `PDF_IMAGE_JPEG_QUALITY`. */
  quality?: number;
  /** JPEG colorspace. Defaults to `'srgb'`. */
  colorspace?: DctColorspace;
  /** Dict /Filter form. Defaults to `'name'` (bare `/DCTDecode`). */
  filterForm?: DctFilterForm;
  /** Attach a real gray SMask XObject to the image dict. Default false. */
  withSMask?: boolean;
  /** Emit a valid dict with an SOI + garbage stream instead of a real JPEG. Default false. */
  corrupt?: boolean;
}

export interface DctPdfFixture {
  /** The saved single-page PDF. */
  bytes: Buffer;
  /** Pixel dims the image dict is expected to report. */
  expected: { width: number; height: number };
}

/** JPEG Start-Of-Image marker: the only valid part of a corrupt stream. */
const JPEG_SOI = Buffer.from([0xff, 0xd8]);

/**
 * Stream size for corrupt fixtures: above the bytes threshold so the
 * adapter's eligibility gate lets the garbage reach the decode step.
 */
const CORRUPT_STREAM_BYTES = PDF_IMAGE_MIN_DCT_STREAM_BYTES + 1024;

/** Uniform gray value written into SMask fixtures. */
const MASK_GRAY = 128;
/**
 * SMask alpha: pdf-lib's PNG loader keeps the alpha channel only when
 * at least one pixel is < 255 (`hasAlphaValues = alphaChannel.some(a => a < 255)`),
 * so a fully opaque mask would be dropped and no /SMask would be
 * produced. The fixture mask is semi-transparent on purpose.
 */
const MASK_ALPHA = 0.5;

/** Gaussian noise parameters: high-entropy worst case for the encoder. */
const NOISE_MEAN = 128;
const NOISE_SIGMA = 30;

/**
 * jsdom-realm-safe view of a Buffer for pdf-lib byte handoffs, with an
 * exact-backing-store guarantee.
 *
 * Two pitfalls are handled here:
 * - REALM: under vitest's jsdom environment a raw Node Buffer fails
 *   pdf-lib's `instanceof Uint8Array` validation — hence the fresh
 *   `Uint8Array` constructed in the CURRENT realm.
 * - POOLING: pdf-lib's embedders (`JpegEmbedder.for` et al.) build a
 *   `DataView` over the view's WHOLE backing ArrayBuffer, ignoring
 *   `byteOffset`. Small sharp outputs (< Buffer.poolSize / 2) live in
 *   Node's shared 8KB pool, so a zero-copy view would be parsed from
 *   the pool's first byte ("SOI not found in JPEG"). When the Buffer is
 *   not exactly its backing store we copy, guaranteeing the ArrayBuffer
 *   holds exactly the fixture bytes. (`PDFDocument.load` walks the view
 *   itself and is safe either way.)
 */
function asUint8ArrayView(bytes: Buffer): Uint8Array {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return new Uint8Array(bytes.buffer, 0, bytes.byteLength);
  }
  return new Uint8Array(bytes);
}

function colorSpaceNameFor(colorspace: DctColorspace): string {
  switch (colorspace) {
    case 'cmyk':
      return 'DeviceCMYK';
    case 'gray':
      return 'DeviceGray';
    default:
      return 'DeviceRGB';
  }
}

/** Guards a lookup: the embedded image/mask hosts must be raw streams. */
function requireRawStream(doc: PDFDocument, ref: PDFRef): PDFRawStream {
  const obj = doc.context.lookup(ref);
  if (!(obj instanceof PDFRawStream)) {
    throw new Error(`Expected a PDFRawStream under indirect reference ${ref}`);
  }
  return obj;
}

/**
 * Rewrites the stream dict's /Filter into a PDFArray when a non-default
 * form is requested. `'name'` is a no-op — embedJpg already stores a
 * bare `/DCTDecode` PDFName.
 */
function applyFilterForm(
  doc: PDFDocument,
  stream: PDFRawStream,
  form: DctFilterForm,
): void {
  if (form === 'name') {
    return;
  }
  const names = form === 'array' ? ['DCTDecode'] : ['FlateDecode', 'DCTDecode'];
  stream.dict.set(PDFName.of('Filter'), doc.context.obj(names));
}

/**
 * Encodes the fixture JPEG with REAL sharp. Noise → gaussian static
 * (incompressible); flat → a solid pastel color (compresses to a few KB).
 * `cmyk`/`gray` are real libvips colorspace conversions, so the encoded
 * JPEG's component count — and therefore pdf-lib's dict ColorSpace —
 * genuinely changes.
 */
async function encodeDctJpeg(
  options: Pick<DctPdfBuilderOptions, 'width' | 'height' | 'content' | 'quality' | 'colorspace'>,
): Promise<Buffer> {
  const { width, height, content, quality, colorspace } = options;
  const pipeline = sharp({
    create:
      content === 'noise'
        ? {
            width,
            height,
            channels: 3,
            background: { r: 0, g: 0, b: 0 },
            noise: { type: 'gaussian', mean: NOISE_MEAN, sigma: NOISE_SIGMA },
          }
        : {
            width,
            height,
            channels: 3,
            background: { r: 215, g: 220, b: 228 },
          },
  });
  const colorspacePipeline =
    colorspace === 'cmyk'
      ? pipeline.toColorspace('cmyk')
      : colorspace === 'gray'
        ? pipeline.toColorspace('b-w')
        : pipeline;
  return Buffer.from(await colorspacePipeline.jpeg({ quality }).toBuffer());
}

/**
 * Builds the fixture PDF. See the module docs for the recipe each option
 * combination produces.
 */
export async function buildDctPdf(
  options: DctPdfBuilderOptions,
): Promise<DctPdfFixture> {
  const {
    width,
    height,
    content,
    quality = PDF_IMAGE_JPEG_QUALITY,
    colorspace = 'srgb',
    filterForm = 'name',
    withSMask = false,
    corrupt = false,
  } = options;

  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);

  if (corrupt) {
    // Structurally valid PDF; only the stream CONTENT is garbage.
    const dict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: colorSpaceNameFor(colorspace),
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
    });
    const garbage = Buffer.alloc(CORRUPT_STREAM_BYTES - JPEG_SOI.length, 0x5a);
    const stream = PDFRawStream.of(
      dict,
      new Uint8Array(Buffer.concat([JPEG_SOI, garbage])),
    );
    const ref = doc.context.register(stream);
    applyFilterForm(doc, stream, filterForm);
    page.node.setXObject(PDFName.of('ImCorrupt'), ref);
    return { bytes: Buffer.from(await doc.save()), expected: { width, height } };
  }

  const jpegBytes = await encodeDctJpeg({
    width,
    height,
    content,
    quality,
    colorspace,
  });
  const image = await doc.embedJpg(asUint8ArrayView(jpegBytes));
  page.drawImage(image, { x: 0, y: 0, width, height });

  let smaskHostRef: PDFRef | undefined;
  if (withSMask) {
    const pngWithAlpha = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: MASK_GRAY, g: MASK_GRAY, b: MASK_GRAY, alpha: MASK_ALPHA },
      },
    })
      .png()
      .toBuffer();
    const maskHost = await doc.embedPng(asUint8ArrayView(pngWithAlpha));
    smaskHostRef = maskHost.ref;
  }

  // First save FLUSHES the embedders: embedJpg/embedPng only reserve a
  // ref — the actual PDFRawStream lands in doc.context during save. Only
  // after this flush can the fixture mutate the image dicts.
  await doc.save();

  const imageStream = requireRawStream(doc, image.ref);
  if (smaskHostRef) {
    const hostStream = requireRawStream(doc, smaskHostRef);
    const smaskRef = hostStream.dict.get(PDFName.of('SMask'));
    if (!(smaskRef instanceof PDFRef)) {
      throw new Error('embedPng produced no /SMask — is the PNG missing its alpha channel?');
    }
    imageStream.dict.set(PDFName.of('SMask'), smaskRef);
  }
  applyFilterForm(doc, imageStream, filterForm);

  return { bytes: Buffer.from(await doc.save()), expected: { width, height } };
}
