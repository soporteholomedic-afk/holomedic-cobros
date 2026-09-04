import { Readable } from 'node:stream';
import { vi } from 'vitest';
import type {
  IEmailService,
  IEnvioHistoryRepository,
  IFileRepository,
  IPdfCompressor,
  PdfCompressionResult,
} from '../../domain/ports';

/**
 * Shared test doubles for the `SendResultsUseCase` suites. Extracted from
 * the per-file copies (`sendResults.test.ts`, `sendResults.history.test.ts`)
 * so the compression suite can program the same port fakes without a third
 * duplicate. Behavior is identical to the originals — do not change semantics
 * here without updating the originating suites.
 */

export type ReadFn = IFileRepository['read'];
export type SendFn = IEmailService['sendWithAttachments'];
export type InsertFn = IEnvioHistoryRepository['insert'];
export type UpdateStatusFn = IEnvioHistoryRepository['updateStatus'];
export type CompressFn = IPdfCompressor['compress'];

export function makeMockRepo(overrides: {
  read?: ReturnType<typeof vi.fn<ReadFn>>;
} = {}): IFileRepository {
  const readFn: ReturnType<typeof vi.fn<ReadFn>> =
    overrides.read ?? vi.fn<ReadFn>().mockResolvedValue(Readable.from([Buffer.from('default-bytes')]));
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: readFn as unknown as ReadFn,
  };
}

export function makeMockEmail(overrides: {
  sendWithAttachments?: ReturnType<typeof vi.fn<SendFn>>;
} = {}): IEmailService {
  const sendFn: ReturnType<typeof vi.fn<SendFn>> =
    overrides.sendWithAttachments ??
    vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok@mail.com>' });
  return {
    sendWithAttachments: sendFn as unknown as SendFn,
  };
}

export function makeMockHistory(
  overrides: {
    insert?: ReturnType<typeof vi.fn<InsertFn>>;
    updateStatus?: ReturnType<typeof vi.fn<UpdateStatusFn>>;
  } = {},
): IEnvioHistoryRepository {
  return {
    insert: overrides.insert ?? vi.fn<InsertFn>().mockResolvedValue('row-001'),
    updateStatus: overrides.updateStatus ?? vi.fn<UpdateStatusFn>().mockResolvedValue(undefined),
    search: vi.fn(),
    getById: vi.fn(),
  };
}

/** Build a Readable stream that emits the given buffer and closes. */
export function streamFromBuffer(buf: Buffer): NodeJS.ReadableStream {
  return Readable.from([buf]);
}

/** Assemble a full `PdfCompressionResult` around a byte payload. */
export function compressionResult(
  overrides: Partial<PdfCompressionResult> & { bytes: Buffer },
): PdfCompressionResult {
  return {
    originalBytes: overrides.bytes.length,
    outputBytes: overrides.bytes.length,
    method: 'pdf-lib-lossless',
    durationMs: 1,
    ...overrides,
  };
}

/**
 * Fake `IPdfCompressor` whose `compress` is a vitest mock. Program it with
 * `compress.mockResolvedValue(...)` / `mockRejectedValue(...)` per scenario.
 * Default implementation: best-of passthrough (mirrors the real adapter's
 * "grew" branch) so a compressor can be attached without changing bytes.
 */
export function makeFakeCompressor(
  impl: CompressFn = async (input) => compressionResult({ bytes: input, method: 'pdf-lib-passthrough', skippedReason: 'grew' }),
): { compressor: IPdfCompressor; compress: ReturnType<typeof vi.fn<CompressFn>> } {
  const compress = vi.fn<CompressFn>(impl);
  return { compressor: { compress }, compress };
}
