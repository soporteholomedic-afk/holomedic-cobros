import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import { SendResultsUseCase } from '../sendResults';
import type { IFileRepository, IEmailService } from '../../domain/ports';
import type { SelectedFileRef } from '../../domain/entities';

// ---- Test doubles ----

type ReadFn = IFileRepository['read'];
type SendFn = IEmailService['sendWithAttachments'];

function makeMockRepo(overrides: {
  read?: ReturnType<typeof vi.fn<ReadFn>>;
} = {}): IFileRepository {
  const readFn: ReturnType<typeof vi.fn<ReadFn>> =
    overrides.read ?? vi.fn<ReadFn>().mockResolvedValue(Readable.from([Buffer.from('default-bytes')]));
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: readFn as unknown as ReadFn,
  };
}

function makeMockEmail(overrides: {
  sendWithAttachments?: ReturnType<typeof vi.fn<SendFn>>;
} = {}): IEmailService {
  const sendFn: ReturnType<typeof vi.fn<SendFn>> =
    overrides.sendWithAttachments ??
    vi.fn<SendFn>().mockResolvedValue({ success: true, messageId: '<ok@mail.com>' });
  return {
    sendWithAttachments: sendFn as unknown as SendFn,
  };
}

/** Build a Readable stream that emits the given buffer and closes. */
function streamFromBuffer(buf: Buffer): NodeJS.ReadableStream {
  return Readable.from([buf]);
}

// ---- Test fixtures ----

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

const REFS_OK: SelectedFileRef[] = [
  { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: '', name: 'cert.pdf' },
  { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'emo.pdf' },
];

const DEFAULT_PARAMS = {
  to: ['cliente@example.com'],
  subject: 'Resultados',
  html: '<p>Adjuntos</p>',
  fileRefs: REFS_OK,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * PR #2 — the use case now orchestrates `IFileRepository.read` →
 * `streamToBuffer` → `IEmailService.sendWithAttachments` instead of
 * forwarding pre-built `EmailAttachment[]`. This is the layer that
 * turns `fileRefs: SelectedFileRef[]` into the real PDF bytes the
 * receiver opens.
 */
describe('SendResultsUseCase (PR #2 — file resolver + byte-equal)', () => {
  // ---- Happy path: byte-equal real bytes ----

  it('forwards the EXACT buffer returned by the repo as attachment.content (real-bytes regression)', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result.success).toBe(true);
    expect(mockRead).toHaveBeenCalledWith('20123456789', '12345678', 'AT-001', '', 'cert.pdf');

    // The buffer the use case built MUST be byte-equal to the one
    // the repo stream emitted. This is THE regression test for the
    // PDF corruption bug.
    const call = (mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      attachments: { filename: string; content: Buffer }[];
    };
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]!.filename).toBe('cert.pdf');
    expect(Buffer.compare(call.attachments[0]!.content, PDF_BYTES)).toBe(0);
  });

  it('resolves each fileRef independently and builds one attachment per ref', async () => {
    const secondBytes = Buffer.from('a,b,c\n1,2,3\n');
    const mockRead = vi
      .fn<ReadFn>()
      .mockResolvedValueOnce(streamFromBuffer(PDF_BYTES))
      .mockResolvedValueOnce(streamFromBuffer(secondBytes));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: REFS_OK });

    expect(result.success).toBe(true);
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(mockRead).toHaveBeenNthCalledWith(1, '20123456789', '12345678', 'AT-001', '', 'cert.pdf');
    expect(mockRead).toHaveBeenNthCalledWith(
      2,
      '20123456789',
      '12345678',
      'AT-001',
      'LEGAJOS',
      'emo.pdf',
    );

    const call = (mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      attachments: { filename: string; content: Buffer }[];
    };
    expect(call.attachments).toHaveLength(2);
    expect(Buffer.compare(call.attachments[0]!.content, PDF_BYTES)).toBe(0);
    expect(Buffer.compare(call.attachments[1]!.content, secondBytes)).toBe(0);
  });

  it('forwards cc to the email service when provided', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    await useCase.execute({
      ...DEFAULT_PARAMS,
      cc: ['copy@example.com'],
      fileRefs: [REFS_OK[0]!],
    });

    const call = (mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as {
      cc?: string[];
    };
    expect(call.cc).toEqual(['copy@example.com']);
  });

  it('omits cc from the email call when not provided (no empty-array leak)', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    const call = (mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('cc');
  });

  it('forwards subject and html to the email service unchanged', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    await useCase.execute({
      to: ['a@b.com'],
      subject: 'Subject here',
      html: '<p>body</p>',
      fileRefs: [REFS_OK[0]!],
    });

    const call = (mockEmail.sendWithAttachments as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(call.subject).toBe('Subject here');
    expect(call.html).toBe('<p>body</p>');
    expect(call.to).toEqual(['a@b.com']);
  });

  it('returns success with messageId when sendEmail resolves with success', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result).toEqual({ success: true, messageId: '<ok@mail.com>' });
  });

  // ---- Sanitisation ----

  it('rejects a ref with traversal in path before calling read (VALIDATION_ERROR)', async () => {
    const mockRead = vi.fn<ReadFn>();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const badRef: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '../../etc',
      name: 'passwd',
    };

    const result = await useCase.execute({
      ...DEFAULT_PARAMS,
      fileRefs: [badRef],
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockRead).not.toHaveBeenCalled();
    // Critical: the email service MUST NOT be called when validation
    // fails.
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  it('rejects a ref with backslash traversal in name before calling read (VALIDATION_ERROR)', async () => {
    const mockRead = vi.fn<ReadFn>();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const badRef: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '',
      name: '..\\evil.pdf',
    };

    const result = await useCase.execute({
      ...DEFAULT_PARAMS,
      fileRefs: [badRef],
    });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('rejects a ref with leading slash in path (VALIDATION_ERROR)', async () => {
    const mockRead = vi.fn<ReadFn>();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const badRef: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '/etc/passwd',
      name: 'passwd',
    };

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [badRef] });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockRead).not.toHaveBeenCalled();
  });

  // ---- Limits ----

  it('rejects an empty fileRefs array (VALIDATION_ERROR)', async () => {
    const mockRead = vi.fn<ReadFn>();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [] });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('rejects more than 10 fileRefs before any read (VALIDATION_ERROR)', async () => {
    const mockRead = vi.fn<ReadFn>();
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const refs = Array.from({ length: 11 }, (_, i) => ({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '',
      name: `file-${i}.pdf`,
    }));

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: refs });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  // ---- I/O failures ----

  it('returns VALIDATION_ERROR with "File not found" when the repo throws ENOENT', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const mockRead = vi.fn<ReadFn>().mockRejectedValue(err);
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  it('returns INTERNAL_ERROR when the repo throws a non-ENOENT I/O error', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const mockRead = vi.fn<ReadFn>().mockRejectedValue(err);
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  it('returns INTERNAL_ERROR when the stream emits an error mid-read', async () => {
    const failingStream = new Readable({
      read() {
        this.destroy(new Error('disk failure mid-read'));
      },
    });
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(failingStream);
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  it('aborts the whole send when one of multiple refs fails to read (no partial send)', async () => {
    const err = Object.assign(new Error('EIO'), { code: 'EIO' });
    const mockRead = vi
      .fn<ReadFn>()
      .mockResolvedValueOnce(streamFromBuffer(PDF_BYTES))
      .mockRejectedValueOnce(err);
    const mockEmail = makeMockEmail();
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: REFS_OK });

    expect(result).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(mockEmail.sendWithAttachments).not.toHaveBeenCalled();
  });

  // ---- Email service failure ----

  it('returns SMTP_ERROR when the email service resolves with success: false', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(streamFromBuffer(PDF_BYTES));
    const mockEmail = makeMockEmail({
      sendWithAttachments: vi
        .fn<SendFn>()
        .mockResolvedValue({ success: false, error: 'SMTP down' }),
    });
    const useCase = new SendResultsUseCase(makeMockRepo({ read: mockRead }), mockEmail);

    const result = await useCase.execute({ ...DEFAULT_PARAMS, fileRefs: [REFS_OK[0]!] });

    expect(result).toMatchObject({ success: false, code: 'SMTP_ERROR', error: 'SMTP down' });
  });
});
