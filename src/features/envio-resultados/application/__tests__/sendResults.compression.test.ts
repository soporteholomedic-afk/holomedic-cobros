import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendResultsUseCase } from '../sendResults';
import { MAX_FILE_BYTES } from '../sendResults';
import type { SelectedFileRef } from '../../domain/entities';
import type { PdfCompressionResult } from '../../domain/ports';
import {
  compressionResult,
  makeFakeCompressor,
  makeMockEmail,
  makeMockHistory,
  makeMockRepo,
  streamFromBuffer,
  type ReadFn,
} from './fakes';

/**
 * comprimir-pdfs-consolidados — use-case hook + cap reordering (RF3,
 * RF4-legacy, RF6). Design §7 cases 1–7.
 *
 * Contract under test:
 * - With a compressor attached: the UNC read allowance doubles
 *   (MAX_READ_BYTES_WITH_COMPRESSION = 2 × 30 MB), PDF-magic bytes are
 *   compressed (fail-open), and the 30 MB per-file cap is enforced on the
 *   RESULT — a residual over-cap file yields a per-file, size-explicit
 *   VALIDATION_ERROR (history row `error`), never a whole-send abort.
 * - Without a compressor (kill switch OFF / not wired): byte-identical
 *   legacy pipeline INCLUDING legacy cap ordering (30 MB read cap →
 *   INTERNAL_ERROR, verbatim streamToBuffer message).
 * - Local attachments: same emailed-copy compression treatment, still
 *   exempt from the per-file cap.
 * - The compressor only ever sees `%PDF-`-magic buffers (sniff via
 *   subarray(0, 5) — names are renamed/sanitized, extensions lie).
 */

const MIB = 1024 * 1024;

/** N-MiB buffer starting with the %PDF- magic (sniffable). */
function pdfBufferOfSize(mib: number): Buffer {
  const head = Buffer.from('%PDF-1.4\n');
  return Buffer.concat([head, Buffer.alloc(mib * MIB - head.length, 0x41)]);
}

/** N-MiB buffer WITHOUT the PDF magic (e.g. a scan/zip misnamed .pdf). */
function nonPdfBufferOfSize(mib: number): Buffer {
  return Buffer.alloc(mib * MIB, 0x42);
}

const REF: SelectedFileRef = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  path: '',
  name: 'grande.pdf',
};

const BASE_PARAMS = {
  to: ['cliente@example.com'],
  subject: 'Resultados',
  html: '<p>Adjuntos</p>',
  fileRefs: [REF],
  nombreCompleto: '',
  destino: '',
};

type EmailCall = { attachments: { filename: string; content: Buffer }[] };

/** First email dispatch call, asserted to exist. */
function firstEmailCall(mockEmail: ReturnType<typeof makeMockEmail>): EmailCall {
  const call = (
    mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>
  ).mock.calls[0]?.[0] as EmailCall | undefined;
  expect(call, 'email service must have been dispatched exactly once').toBeDefined();
  return call!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('SendResultsUseCase — PDF compression seam (comprimir-pdfs-consolidados)', () => {
  it('exposes MAX_READ_BYTES_WITH_COMPRESSION as 2× the legacy per-file cap', async () => {
    // Structural pin for the raised read allowance (design §3). Dynamic
    // import so the RED run reports a per-test failure, not a collection
    // error for the whole file.
    const mod = await import('../sendResults');
    expect(mod.MAX_READ_BYTES_WITH_COMPRESSION).toBe(2 * MAX_FILE_BYTES);
    expect(mod.MAX_READ_BYTES_WITH_COMPRESSION).toBe(60 * MIB);
  });

  // ---- Design §7 case 1: near-miss file shrunk under cap ----

  it('compresses a 32 MB UNC file to 20 MB and dispatches the compressed bytes (read allowance raised)', async () => {
    const original = pdfBufferOfSize(32); // over the legacy 30 MB read cap
    const compressed = pdfBufferOfSize(20);
    const { compressor, compress } = makeFakeCompressor();
    compress.mockResolvedValue(
      compressionResult({
        bytes: compressed,
        originalBytes: original.length,
        outputBytes: compressed.length,
        method: 'pdf-lib-lossless',
      }) satisfies PdfCompressionResult,
    );
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
      undefined,
      compressor,
    );

    const result = await useCase.execute(BASE_PARAMS);

    expect(result.success).toBe(true);
    // The compressor ran on the ORIGINAL bytes and only the compressed
    // payload reached the email boundary. Byte-compare (not reference
    // identity): streamToBuffer's Buffer.concat yields a copy, and a raw
    // 32 MB Buffer inside a failing expect would OOM the vitest worker
    // while rendering the failure diff.
    expect(compress).toHaveBeenCalledTimes(1);
    const received = compress.mock.calls[0]?.[0] as Buffer | undefined;
    expect(received && Buffer.compare(received, original)).toBe(0);
    const call = firstEmailCall(mockEmail);
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]!.filename).toBe('grande.pdf');
    expect(Buffer.compare(call.attachments[0]!.content, compressed)).toBe(0);
  });

  // ---- Design §7 case 2: still over cap after compression ----

  it('fails per-file with a size-explicit VALIDATION_ERROR when 45 MB only compresses to 38 MB (history error, email not called)', async () => {
    const original = pdfBufferOfSize(45);
    const compressed = pdfBufferOfSize(38); // still > 30 MB
    const { compressor, compress } = makeFakeCompressor();
    compress.mockResolvedValue(
      compressionResult({
        bytes: compressed,
        originalBytes: original.length,
        outputBytes: compressed.length,
      }),
    );
    const mockEmail = makeMockEmail();
    const history = makeMockHistory();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
      history,
      compressor,
    );

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...REF, name: 'pesado.pdf' }],
    });

    expect(result.success).toBe(false);
    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    // Size-explicit: names the file AND both sizes (original + compressed).
    const error = (result as { error: string }).error;
    expect(error).toContain('pesado.pdf');
    expect(error).toContain('original 45.0 MB');
    expect(error).toContain('compressed 38.0 MB');
    // History row finalized as error with the same size-explicit detail.
    expect(history.updateStatus).toHaveBeenCalledWith('row-001', 'error', error);
    // Per-file failure — the send never reaches dispatch.
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  // ---- Design §7 case 3: compression failure fails open ----

  it('attaches the ORIGINAL bytes and proceeds when the compressor rejects (fail-open)', async () => {
    const original = pdfBufferOfSize(5);
    const { compressor, compress } = makeFakeCompressor();
    compress.mockRejectedValue(new Error('compressor exploded'));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
      undefined,
      compressor,
    );

    const result = await useCase.execute(BASE_PARAMS);

    // Fail-open: the compressor RAN and threw, yet the send proceeds with
    // byte-equal original bytes.
    expect(compress).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, original)).toBe(0);
  });

  // ---- Design §7 case 4: kill-switch OFF restores legacy cap ordering ----

  it('keeps the legacy INTERNAL_ERROR with the verbatim 30 MB message when no compressor is injected (31 MB read)', async () => {
    const original = pdfBufferOfSize(31); // 31 MB > 30 MB legacy read cap
    const mockEmail = makeMockEmail();
    // Legacy 3-arg construction: absence of the port IS kill-switch-off.
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
    );

    const result = await useCase.execute(BASE_PARAMS);

    // Byte-identical legacy failure: streamToBuffer threw at 30 MB BEFORE
    // any compression could run, and the whole send aborts as INTERNAL_ERROR.
    expect(result).toEqual({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'File exceeds 31457280 bytes',
    });
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  // ---- Design §7 case 5: kill-switch byte-identity characterization ----

  it('attaches byte-equal read bytes for a normal file when no compressor is injected (legacy passthrough)', async () => {
    const original = pdfBufferOfSize(1);
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
    );

    const result = await useCase.execute(BASE_PARAMS);

    expect(result.success).toBe(true);
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, original)).toBe(0);
  });

  // ---- Design §7 case 6: local attachments ----

  it('compresses a local PDF attachment the same way (emailed copy only)', async () => {
    const original = pdfBufferOfSize(2);
    const compressed = pdfBufferOfSize(1);
    const { compressor, compress } = makeFakeCompressor();
    compress.mockResolvedValue(
      compressionResult({ bytes: compressed, outputBytes: compressed.length }),
    );
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo(), mockEmail, undefined, compressor);

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [],
      localAttachments: [
        { filename: 'local.pdf', contentType: 'application/pdf', content: original },
      ],
    });

    expect(result.success).toBe(true);
    expect(compress).toHaveBeenCalledTimes(1);
    const sentToCompressor = compress.mock.calls[0]?.[0] as Buffer | undefined;
    expect(sentToCompressor && Buffer.compare(sentToCompressor, original)).toBe(0);
    const call = firstEmailCall(mockEmail);
    expect(call.attachments[0]!.filename).toBe('local.pdf');
    expect(Buffer.compare(call.attachments[0]!.content, compressed)).toBe(0);
  });

  it('skips compression for a local non-PDF attachment (magic-byte sniff, not extension)', async () => {
    const original = nonPdfBufferOfSize(2); // named .pdf but no %PDF- magic
    const { compressor, compress } = makeFakeCompressor();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo(), mockEmail, undefined, compressor);

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [],
      localAttachments: [
        { filename: 'scan.pdf', contentType: 'application/pdf', content: original },
      ],
    });

    expect(result.success).toBe(true);
    // The compressor never sees non-PDF bytes.
    expect(compress).not.toHaveBeenCalled();
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, original)).toBe(0);
  });

  it('sniffs per attachment: mixed local batch calls the compressor ONLY with the PDF buffer', async () => {
    const pdf = pdfBufferOfSize(1);
    const notPdf = nonPdfBufferOfSize(1);
    const { compressor, compress } = makeFakeCompressor();
    compress.mockImplementation(async (input) =>
      compressionResult({ bytes: input, method: 'pdf-lib-passthrough', skippedReason: 'grew' }),
    );
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo(), mockEmail, undefined, compressor);

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [],
      localAttachments: [
        { filename: 'a.pdf', contentType: 'application/pdf', content: notPdf },
        { filename: 'b.pdf', contentType: 'application/pdf', content: pdf },
      ],
    });

    expect(result.success).toBe(true);
    expect(compress).toHaveBeenCalledTimes(1);
    const sentToCompressor = compress.mock.calls[0]?.[0] as Buffer | undefined;
    expect(sentToCompressor && Buffer.compare(sentToCompressor, pdf)).toBe(0);
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, notPdf)).toBe(0);
    expect(Buffer.compare(call.attachments[1]!.content, pdf)).toBe(0);
  });

  it('does NOT cap-reject a 40 MB local attachment (cap exemption preserved with compressor attached)', async () => {
    const original = pdfBufferOfSize(40); // way over the 30 MB cap — local is exempt
    const { compressor, compress } = makeFakeCompressor(); // passthrough (grew)
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo(), mockEmail, undefined, compressor);

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [],
      localAttachments: [
        { filename: 'huge.pdf', contentType: 'application/pdf', content: original },
      ],
    });

    expect(result.success).toBe(true);
    expect(compress).toHaveBeenCalledTimes(1);
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, original)).toBe(0);
  });

  // ---- Design §7 case 7: raised read allowance + result-cap enforcement ----

  it('reads a 40 MB UNC file under the raised allowance but rejects the 40 MB RESULT (cap enforced post-compression)', async () => {
    const original = pdfBufferOfSize(40);
    // Passthrough compressor (best-of "grew"): proves the read itself
    // succeeded at 40 MB — the legacy 30 MB read cap would have thrown
    // INTERNAL_ERROR instead — AND that the cap is enforced on the result.
    const { compressor, compress } = makeFakeCompressor();
    const mockEmail = makeMockEmail();
    const history = makeMockHistory();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
      history,
      compressor,
    );

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...REF, name: 'pesado40.pdf' }],
    });

    expect(compress).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    const error = (result as { error: string }).error;
    expect(error).toContain('pesado40.pdf');
    expect(error).toContain('original 40.0 MB');
    expect(error).toContain('compressed 40.0 MB');
    expect(history.updateStatus).toHaveBeenCalledWith('row-001', 'error', error);
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  // ---- Design §7 case 8: per-file + per-send metrics (RF5) ----

  it('logs one metrics row per file plus the send aggregate when one file shrinks and one fails open', async () => {
    const shrinkSource = pdfBufferOfSize(2);
    const shrinkResult = pdfBufferOfSize(1);
    const failSource = pdfBufferOfSize(3);
    const { compressor, compress } = makeFakeCompressor();
    compress.mockImplementation(async (input) => {
      if (input.length === shrinkSource.length) {
        return compressionResult({
          bytes: shrinkResult,
          originalBytes: shrinkSource.length,
          outputBytes: shrinkResult.length,
          method: 'pdf-lib-lossless',
        });
      }
      throw new Error('compressor exploded');
    });
    const read = vi.fn<ReadFn>().mockImplementation(async (_ruc, _dni, _idAten, _path, name) =>
      streamFromBuffer(name === 'chico.pdf' ? shrinkSource : failSource),
    );
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read }),
      mockEmail,
      undefined,
      compressor,
    );

    const result = await useCase.execute({
      ...BASE_PARAMS,
      fileRefs: [{ ...REF, name: 'chico.pdf' }, { ...REF, name: 'falla.pdf' }],
    });

    expect(result.success).toBe(true);
    const logSpy = vi.mocked(console.log);
    // Per-file rows carry the EXACT tag — the aggregate tag shares the
    // prefix, so filter by strict equality.
    const rows = logSpy.mock.calls
      .filter(([tag]) => tag === '[SendResultsUseCase] pdf metrics')
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(rows).toHaveLength(2);
    const [shrinkRow, failRow] = rows;
    expect(shrinkRow).toMatchObject({
      file: 'chico.pdf',
      originalBytes: shrinkSource.length,
      finalBytes: shrinkResult.length,
      method: 'pdf-lib-lossless',
    });
    // skippedReason appears ONLY when the file was skipped.
    expect(shrinkRow).not.toHaveProperty('skippedReason');
    expect(typeof shrinkRow?.['durationMs']).toBe('number');
    // Fail-open is ALSO logged (spec: metrics for every outcome).
    expect(failRow).toMatchObject({
      file: 'falla.pdf',
      originalBytes: failSource.length,
      finalBytes: failSource.length,
      method: 'pdf-lib-passthrough',
    });
    expect(failRow).not.toHaveProperty('skippedReason');
    // Send-level aggregate with honest arithmetic: totals are the sums
    // of the per-file outcomes; savings come from the shrink alone.
    const aggregate = logSpy.mock.calls.find(
      ([tag]) => tag === '[SendResultsUseCase] pdf metrics aggregate',
    )?.[1] as Record<string, number> | undefined;
    expect(aggregate).toMatchObject({
      files: 2,
      originalBytesTotal: shrinkSource.length + failSource.length,
      finalBytesTotal: shrinkResult.length + failSource.length,
    });
    expect(aggregate?.['savedBytesTotal']).toBe(shrinkSource.length - shrinkResult.length);
  });

  // ---- Design §7 case 9: kill-switch off emits ZERO metrics ----

  it('emits no per-file rows and no aggregate when no compressor is injected', async () => {
    const original = pdfBufferOfSize(1);
    const mockEmail = makeMockEmail();
    // Legacy 3-arg construction: absence of the port IS kill-switch-off.
    const useCase = new SendResultsUseCase(
      makeMockRepo({ read: vi.fn().mockResolvedValue(streamFromBuffer(original)) }),
      mockEmail,
    );

    const result = await useCase.execute(BASE_PARAMS);

    // The send genuinely ran and dispatched — guards against the log
    // being empty merely because nothing executed.
    expect(result.success).toBe(true);
    const call = firstEmailCall(mockEmail);
    expect(Buffer.compare(call.attachments[0]!.content, original)).toBe(0);
    const metricCalls = vi.mocked(console.log).mock.calls.filter(
      ([tag]) =>
        tag === '[SendResultsUseCase] pdf metrics' ||
        tag === '[SendResultsUseCase] pdf metrics aggregate',
    );
    expect(metricCalls).toHaveLength(0);
  });
});
