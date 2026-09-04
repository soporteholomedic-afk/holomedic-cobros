import { PDFDocument } from 'pdf-lib';

import type {
  IPdfCompressor,
  PdfCompressionResult,
  PdfCompressionSkipReason,
} from '../../domain/ports';
import { PDF_COMPRESS_TIMEOUT_MS } from './constants';

/**
 * Thrown by the internal `Promise.race` guard when the load→save work
 * exceeds the configured budget. Classified as a `timeout` passthrough
 * by `classify`.
 */
class PdfCompressionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`PDF compression exceeded its ${timeoutMs}ms budget`);
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

/**
 * Outbound adapter implementing `IPdfCompressor` with pdf-lib (RF2).
 *
 * Pipeline: `PDFDocument.load(input, { updateMetadata: false })` →
 * metadata strip (title/author/subject/keywords/producer/creator) →
 * `save({ useObjectStreams: true })` → Buffer.
 *
 * Deliberate decisions (design §4):
 * - NO `ignoreEncryption` on load: pdf-lib cannot decrypt content, and
 *   re-saving still-encrypted strings would emit corrupt output. Encrypted
 *   input throws at load and is classified as an `encrypted` passthrough.
 * - Best-of guarantee: when the re-serialized output is not strictly
 *   smaller than the input, the ORIGINAL bytes are returned with method
 *   `pdf-lib-passthrough` and skip reason `grew` — a send can never grow
 *   or degrade a document because of this seam.
 * - Fail-open contract: this adapter NEVER throws. Load/parse/timeout
 *   failures resolve with the original bytes plus a `console.warn`, so a
 *   send never fails because compression did.
 */
export class PdfLibCompressorAdapter implements IPdfCompressor {
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = PDF_COMPRESS_TIMEOUT_MS) {
    // `??` (not `||`) so an explicit `0` — as used by the timeout test —
    // is honored instead of falling back to the default budget.
    this.timeoutMs = timeoutMs ?? PDF_COMPRESS_TIMEOUT_MS;
  }

  async compress(pdfBytes: Buffer): Promise<PdfCompressionResult> {
    const startedAt = Date.now();
    try {
      const output = await this.withTimeout(
        (async (): Promise<Buffer> => {
          const doc = await PDFDocument.load(asUint8ArrayView(pdfBytes), {
            updateMetadata: false,
          });
          doc.setTitle('');
          doc.setAuthor('');
          doc.setSubject('');
          doc.setKeywords([]);
          doc.setProducer('');
          doc.setCreator('');
          return Buffer.from(await doc.save({ useObjectStreams: true }));
        })(),
      );

      // Best-of guarantee: never return something bigger than the input.
      if (output.length >= pdfBytes.length) {
        return this.passthrough(pdfBytes, 'grew', startedAt);
      }

      return {
        bytes: output,
        originalBytes: pdfBytes.length,
        outputBytes: output.length,
        method: 'pdf-lib-lossless',
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const reason = this.classify(err);
      console.warn('[PdfLibCompressorAdapter] fail-open', {
        reason,
        sizeBytes: pdfBytes.length,
        error: err instanceof Error ? err.message : String(err),
      });
      return this.passthrough(pdfBytes, reason, startedAt);
    }
  }

  private passthrough(
    pdfBytes: Buffer,
    skippedReason: PdfCompressionSkipReason,
    startedAt: number,
  ): PdfCompressionResult {
    return {
      bytes: pdfBytes,
      originalBytes: pdfBytes.length,
      outputBytes: pdfBytes.length,
      method: 'pdf-lib-passthrough',
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
   * Bounds the in-flight load→save work against the configured budget.
   *
   * Known design limitation: pdf-lib work is synchronous CPU, so this race
   * only protects against async stalls — it cannot preempt synchronous
   * execution. The real operational guards are the
   * `PDF_COMPRESSION_ENABLED` kill switch and the sequential
   * one-file-at-a-time send loop.
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
