import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';

import type {
  IPdfCompressor,
  PdfCompressionResult,
  PdfCompressionSkipReason,
} from '../../domain/ports';
import {
  PDF_COMPRESS_TIMEOUT_MS,
  PDF_IMAGE_JPEG_QUALITY,
  PDF_IMAGE_MIN_DCT_STREAM_BYTES,
  PDF_IMAGE_MIN_LONGEST_SIDE_PX,
  PDF_IMAGE_RESIZE_DIVISOR,
} from './constants';

/**
 * Thrown by the internal `Promise.race` guard when the load→surgery→save
 * work exceeds the configured budget. Classified as a `timeout` fail-open
 * by `classify`.
 */
class PdfCompressionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`PDF image compression exceeded its ${timeoutMs}ms budget`);
    this.name = 'PdfCompressionTimeoutError';
  }
}

/**
 * Zero-copy view of `pdfBytes` as a plain `Uint8Array` constructed in the
 * CURRENT realm. pdf-lib validates its input with `instanceof Uint8Array`,
 * which fails for Node `Buffer`s under vitest's jsdom realm (Buffer extends
 * the Node-realm Uint8Array, not the jsdom one). In production Node the
 * view is built in the same realm and behaves byte-for-byte identically.
 */
function asUint8ArrayView(pdfBytes: Buffer): Uint8Array {
  return new Uint8Array(pdfBytes.buffer, pdfBytes.byteOffset, pdfBytes.byteLength);
}

/** The dynamic-import shape of the `sharp` module (native libvips binding). */
type SharpModule = typeof import('sharp');
/** The callable `sharp(input)` factory (the module's default export). */
type SharpFactory = SharpModule['default'];

/**
 * Module-cached lazy loader for sharp (design §3.2 D4).
 *
 * sharp is a native dependency and its ABSENCE must never crash the route
 * import — hence the lazy `await import('sharp')` resolved on first use
 * and cached for the process lifetime. A load failure is re-thrown with a
 * message that always names 'sharp' so the file-level fail-open warning
 * is diagnosable regardless of the bundler's own error text. The cache is
 * cleared on failure so a transient resolution hiccup can retry on the
 * next compress call instead of caching a rejected promise forever.
 */
let sharpModulePromise: Promise<SharpFactory> | undefined;
async function loadSharp(): Promise<SharpFactory> {
  if (sharpModulePromise === undefined) {
    sharpModulePromise = import('sharp').then((module) => module.default);
  }
  const pending = sharpModulePromise;
  try {
    return await pending;
  } catch (err) {
    sharpModulePromise = undefined;
    throw new Error(
      `sharp native module failed to load: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** True when the stream dict declares Subtype /Image. */
function isImageDict(dict: PDFDict): boolean {
  const subtype = dict.get(PDFName.of('Subtype'));
  return subtype instanceof PDFName && subtype.asString() === '/Image';
}

/**
 * True when DCTDecode is the stream's SOLE filter (design §3.2 D5): a bare
 * `/DCTDecode` name or an exactly-one-element `[/DCTDecode]` array. Multi-
 * codec chains (e.g. `[/FlateDecode,/DCTDecode]` — flate-wrapped DCT) and
 * `/JPXDecode` are ineligible; leaving them untouched is always safe.
 */
function hasSoleDctDecodeFilter(dict: PDFDict): boolean {
  const filter = dict.get(PDFName.of('Filter'));
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

/** Direct-or-indirect numeric dict entry, or undefined when absent. */
function numberFrom(dict: PDFDict, name: string): number | undefined {
  const value = dict.lookup(PDFName.of(name));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
}

/**
 * Outbound adapter implementing `IPdfCompressor` for the `email` profile
 * (spec RF1): pdf-lib DCTDecode stream surgery + sharp decode → ÷2 resize
 * (300→150 DPI) → sRGB → JPEG q75 re-encode.
 *
 * Pipeline: `PDFDocument.load` → two-pass image surgery → (≥1 image
 * replaced) `save({ useObjectStreams: true })`. Pass 1 collects every
 * image dict's `/SMask` reference into an exclusion set — an SMask that is
 * itself an eligible DCT image must NOT be re-encoded (alpha masks must
 * stay gray). Pass 2 re-encodes each eligible, non-excluded image.
 *
 * Eligibility (initial values, tunable via `./constants`): Subtype /Image,
 * DCTDecode as the SOLE filter, longest side ≥
 * `PDF_IMAGE_MIN_LONGEST_SIDE_PX`, stream ≥ `PDF_IMAGE_MIN_DCT_STREAM_BYTES`.
 *
 * Deliberate decisions (design §3.2):
 * - D1 method-id semantics: EVERY adapter-produced row — shrink, grew,
 *   timeout/encrypted/parse-error fail-open, no-eligible no-op — carries
 *   method `'pdf-lib-image-email'`; `skippedReason` carries the why. The
 *   id identifies the WIRED PROFILE so log analytics never confuse email
 *   rows with lossless-profile rows. Documented boundary: the use-case-
 *   emitted `not-pdf` row (produced BEFORE the adapter runs) keeps
 *   `'pdf-lib-passthrough'` — application code is frozen by constraint.
 * - D3 granularity: file-level timeout/classify/best-of wraps the WHOLE
 *   pipeline; a per-image try/catch inside the loop keeps one corrupt DCT
 *   stream from forfeiting the other images' savings (fail-open per image,
 *   dict + stream untouched, loop continues). When ZERO images were
 *   re-encoded the ORIGINAL bytes are returned byte-identically — no
 *   `save()` at all, and NO skippedReason (a no-op is a success: nothing
 *   was attempted).
 * - D4 sharp pipeline: `.rotate()` (EXIF-aware; no-op for EXIF-less
 *   Crystal scans) → `resize({ fit: 'inside', withoutEnlargement: true })`
 *   into the halved-dimension box (exact longest-side ÷2, aspect kept) →
 *   unconditional `.toColorspace('srgb')` → `.jpeg({ quality })` with
 *   mozjpeg OFF so shipped numbers stay the measured numbers. Dict
 *   Width/Height are written from sharp's actual output `info`, NEVER
 *   from arithmetic. sharp runs on the libuv threadpool, so the race
 *   timer GENUINELY preempts a stalled pipeline (unlike pdf-lib sync CPU).
 * - D5 dict surgery on every re-encoded image: Width/Height from `info`,
 *   BitsPerComponent 8, ColorSpace `/DeviceRGB` UNCONDITIONALLY (matching
 *   the unconditional sRGB re-encode), and `DecodeParms`/`Decode` DELETED
 *   (a stale `/ColorTransform 0` from Adobe CMYK or an inverted `/Decode`
 *   array would corrupt the re-encoded image). `/SMask`, `/Subtype` and
 *   `/Filter` are untouched. Replacement goes through
 *   `context.assign(ref, PDFRawStream.of(dict, bytes))`.
 * - Best-of at BOTH levels: per image (replace only when strictly
 *   smaller) and per file (output ≥ input → original bytes with
 *   `skippedReason: 'grew'`). A send can never grow or degrade a document
 *   because of this seam.
 * - Fail-open contract: this adapter NEVER throws. Load/parse/timeout/
 *   native-load failures resolve with the original bytes plus a
 *   `console.warn` (classified timeout|encrypted|parse-error), mirroring
 *   `PdfLibCompressorAdapter`.
 * - NO metadata strip — that concern belongs to the lossless adapter
 *   (divergence characterized by test I15).
 */
export class PdfImageCompressorAdapter implements IPdfCompressor {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = PDF_COMPRESS_TIMEOUT_MS) {
    // `??` (not `||`) so an explicit `0` — as used by the timeout test —
    // is honored instead of falling back to the default budget.
    this.timeoutMs = timeoutMs ?? PDF_COMPRESS_TIMEOUT_MS;
  }

  async compress(pdfBytes: Buffer): Promise<PdfCompressionResult> {
    const startedAt = Date.now();
    try {
      const output = await this.withTimeout(this.recompressEligibleImages(pdfBytes));

      // No-op success (D3): recompressEligibleImages returns the ORIGINAL
      // buffer — identity, not an equal copy — when nothing was re-encoded.
      // No save() happened; the bytes are byte-identical by construction
      // and NO skippedReason is set: nothing was attempted.
      if (output === pdfBytes) {
        return {
          bytes: pdfBytes,
          originalBytes: pdfBytes.length,
          outputBytes: pdfBytes.length,
          method: 'pdf-lib-image-email',
          durationMs: Date.now() - startedAt,
        };
      }

      // File-level best-of guarantee: never return something bigger.
      if (output.length >= pdfBytes.length) {
        return this.passthrough(pdfBytes, 'grew', startedAt);
      }

      return {
        bytes: output,
        originalBytes: pdfBytes.length,
        outputBytes: output.length,
        method: 'pdf-lib-image-email',
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const reason = this.classify(err);
      console.warn('[PdfImageCompressorAdapter] fail-open', {
        reason,
        sizeBytes: pdfBytes.length,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.passthrough(pdfBytes, reason, startedAt);
    }
  }

  /**
   * The full load → surgery → save pipeline, run under the timeout guard.
   * Returns the ORIGINAL buffer reference when zero images were re-encoded
   * (the caller's no-op signal), otherwise the saved output bytes.
   */
  private async recompressEligibleImages(pdfBytes: Buffer): Promise<Buffer> {
    const sharp = await loadSharp();
    const doc = await PDFDocument.load(asUint8ArrayView(pdfBytes), {
      updateMetadata: false,
    });

    // Pass 1 — collect the /SMask targets of every image dict into an
    // exclusion set: a mask that is itself an eligible DCT image must NOT
    // be re-encoded (alpha masks must stay single-channel gray).
    const smaskExclusions = new Set<PDFRef>();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || !isImageDict(obj.dict)) {
        continue;
      }
      const smask = obj.dict.get(PDFName.of('SMask'));
      if (smask instanceof PDFRef) {
        smaskExclusions.add(smask);
      }
    }

    // Pass 2 — re-encode every eligible, non-excluded image. Per-image
    // try/catch: one corrupt stream keeps its dict + bytes and the loop
    // continues (design §3.2 D3).
    let reencodedCount = 0;
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || smaskExclusions.has(ref)) {
        continue;
      }
      const { dict } = obj;
      if (!isImageDict(dict) || !hasSoleDctDecodeFilter(dict)) {
        continue;
      }
      const width = numberFrom(dict, 'Width');
      const height = numberFrom(dict, 'Height');
      if (width === undefined || height === undefined) {
        continue;
      }
      if (Math.max(width, height) < PDF_IMAGE_MIN_LONGEST_SIDE_PX) {
        continue;
      }
      const streamBytes = Buffer.from(obj.getContents());
      if (streamBytes.length < PDF_IMAGE_MIN_DCT_STREAM_BYTES) {
        continue;
      }

      try {
        const { data, info } = await sharp(streamBytes)
          .rotate()
          .resize({
            width: Math.ceil(width / PDF_IMAGE_RESIZE_DIVISOR),
            height: Math.ceil(height / PDF_IMAGE_RESIZE_DIVISOR),
            fit: 'inside',
            withoutEnlargement: true,
          })
          .toColorspace('srgb')
          .jpeg({ quality: PDF_IMAGE_JPEG_QUALITY })
          .toBuffer({ resolveWithObject: true });

        // Per-image best-of: keep the original stream when the re-encode
        // is not strictly smaller.
        if (data.length >= streamBytes.length) {
          continue;
        }

        dict.set(PDFName.of('Width'), PDFNumber.of(info.width));
        dict.set(PDFName.of('Height'), PDFNumber.of(info.height));
        dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
        // Unconditional — mirrors the unconditional toColorspace('srgb').
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        // Stale decode hints would corrupt the re-encoded image (D5).
        dict.delete(PDFName.of('DecodeParms'));
        dict.delete(PDFName.of('Decode'));
        doc.context.assign(ref, PDFRawStream.of(dict, new Uint8Array(data)));
        reencodedCount += 1;
      } catch (err) {
        console.warn('[PdfImageCompressorAdapter] image skipped', {
          ref: String(ref),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Zero re-encoded → return ORIGINAL bytes with NO save() at all (D3).
    if (reencodedCount === 0) {
      return pdfBytes;
    }
    return Buffer.from(await doc.save({ useObjectStreams: true }));
  }

  /**
   * Passthrough row: original bytes with a skip reason. Per D1 the method
   * id stays `'pdf-lib-image-email'` — it names the WIRED PROFILE, while
   * `skippedReason` names the why (grew | timeout | encrypted | parse-error).
   */
  private passthrough(
    pdfBytes: Buffer,
    skippedReason: PdfCompressionSkipReason,
    startedAt: number,
  ): PdfCompressionResult {
    return {
      bytes: pdfBytes,
      originalBytes: pdfBytes.length,
      outputBytes: pdfBytes.length,
      method: 'pdf-lib-image-email',
      durationMs: Date.now() - startedAt,
      skippedReason,
    };
  }

  private classify(err: unknown): PdfCompressionSkipReason {
    if (err instanceof PdfCompressionTimeoutError) {
      return 'timeout';
    }
    const label = err instanceof Error ? `${err.name} ${err.message}` : String(err);
    if (/encrypt/i.test(label)) {
      return 'encrypted';
    }
    return 'parse-error';
  }

  /**
   * Bounds the in-flight load→surgery→save work against the configured
   * budget. Unlike pdf-lib's synchronous CPU work, sharp decodes/encodes
   * on the libuv threadpool, so this race GENUINELY preempts a stalled
   * pipeline: the rejected timeout promise wins the race while sharp
   * work is still in flight.
   */
  private withTimeout<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PdfCompressionTimeoutError(this.timeoutMs)),
        this.timeoutMs,
      );
      // Do not keep the process alive just for the guard timer.
      timer.unref?.();
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }
}
