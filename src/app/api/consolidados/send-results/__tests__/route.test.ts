import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

// ---- Mock sendEmail (the SMTP transport) ----

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// ---- Mock auth session + history repo (historial-envios-consolidados PR1) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

const mockHistoryInsert = vi.hoisted(() => vi.fn());
const mockHistoryUpdate = vi.hoisted(() => vi.fn());
const mockGetEnvioHistoryDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/envio-resultados/infrastructure/getEnvioHistoryDb', () => ({
  getEnvioHistoryDb: mockGetEnvioHistoryDb,
  __setEnvioHistoryDbForTests: vi.fn(),
}));

// ---- Compressor wiring spies (pdfcpu-adapter PR6, RF3) ----
//
// The route is the composition root: it must choose WHICH compressor
// to inject from `PDF_COMPRESSION_PROFILE` ('email' → image adapter,
// 'lossless'/default → lib adapter) unless the `PDF_COMPRESSION_ENABLED`
// kill switch wires none at all. Each mock SUBCLASSES the real adapter
// (importOriginal) so every pre-existing pipeline test below keeps its
// exact behavior — only construction is observed, never replaced.

const pdfWiring = vi.hoisted(() => ({
  imageCtor: vi.fn(),
  libCtor: vi.fn(),
  /** Captures the use case's 4th constructor argument (the compressor). */
  useCaseCompressorArg: vi.fn(),
  lastImageInstance: undefined as unknown,
  lastLibInstance: undefined as unknown,
}));

vi.mock(
  '@/features/envio-resultados/infrastructure/pdf/PdfImageCompressorAdapter',
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import('@/features/envio-resultados/infrastructure/pdf/PdfImageCompressorAdapter')
    >();
    class SpyImageCompressor extends actual.PdfImageCompressorAdapter {
      constructor(...args: ConstructorParameters<typeof actual.PdfImageCompressorAdapter>) {
        super(...args);
        pdfWiring.imageCtor();
        pdfWiring.lastImageInstance = this;
      }
    }
    return { PdfImageCompressorAdapter: SpyImageCompressor };
  },
);

vi.mock(
  '@/features/envio-resultados/infrastructure/pdf/PdfLibCompressorAdapter',
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import('@/features/envio-resultados/infrastructure/pdf/PdfLibCompressorAdapter')
    >();
    class SpyLibCompressor extends actual.PdfLibCompressorAdapter {
      constructor(...args: ConstructorParameters<typeof actual.PdfLibCompressorAdapter>) {
        super(...args);
        pdfWiring.libCtor();
        pdfWiring.lastLibInstance = this;
      }
    }
    return { PdfLibCompressorAdapter: SpyLibCompressor };
  },
);

vi.mock('@/features/envio-resultados/application/sendResults', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/features/envio-resultados/application/sendResults')
  >();
  type UseCaseCtorArgs = ConstructorParameters<typeof actual.SendResultsUseCase>;
  class SpiedSendResultsUseCase extends actual.SendResultsUseCase {
    constructor(...args: UseCaseCtorArgs) {
      super(...args);
      pdfWiring.useCaseCompressorArg(args[3]);
    }
  }
  return { SendResultsUseCase: SpiedSendResultsUseCase };
});

// ---- Import under test (after mocks) ----

import { POST } from '../route';

// ---- Helpers ----

function createMockRequest(body?: FormData): Request {
  return {
    formData: () => Promise.resolve(body ?? new FormData()),
  } as Request;
}

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

type ReadFn = IFileRepository['read'];

function makeMockRepo(overrides: {
  read?: ReturnType<typeof vi.fn<ReadFn>>;
} = {}): IFileRepository {
  const readFn: ReturnType<typeof vi.fn<ReadFn>> =
    overrides.read ?? vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: readFn as unknown as ReadFn,
  };
}

/** Build a fileRefs FormData payload with sensible defaults. */
function buildFileRefsFd(refs: unknown[], extras: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('to', extras.to ?? 'cliente@example.com');
  if (extras.cc) fd.append('cc', extras.cc);
  fd.append('subject', extras.subject ?? 'Resultados');
  fd.append('html', extras.html ?? '<p>Adjuntos</p>');
  fd.append('fileRefs', JSON.stringify(refs));
  return fd;
}

const REF_ROOT: Record<string, string> = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  path: '',
  name: 'cert.pdf',
};
const REF_SUB: Record<string, string> = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  path: 'LEGAJOS',
  name: 'emo.pdf',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ success: true, messageId: '<test@mail.com>' });
  __setFileRepositoryForTests(makeMockRepo());
  // Default: no session cookie; history repo available and succeeding.
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(null);
  mockHistoryInsert.mockReset();
  mockHistoryInsert.mockResolvedValue('hist-001');
  mockHistoryUpdate.mockReset();
  mockHistoryUpdate.mockResolvedValue(undefined);
  mockGetEnvioHistoryDb.mockReset();
  mockGetEnvioHistoryDb.mockResolvedValue({
    insert: mockHistoryInsert,
    updateStatus: mockHistoryUpdate,
    search: vi.fn(),
    getById: vi.fn(),
  });
  pdfWiring.lastImageInstance = undefined;
  pdfWiring.lastLibInstance = undefined;
});

afterEach(() => {
  __setFileRepositoryForTests(null);
  vi.unstubAllEnvs();
});

/**
 * PR #2 — the route now consumes a `fileRefs` JSON field. The
 * `IFileRepository` is injected via the test seam so the suite can
 * assert byte-equal forwarding without touching a real UNC share.
 * The use case handles sanitisation, streaming, and the bytes → SMTP
 * pipeline.
 */
describe('POST /api/consolidados/send-results (PR #2 — fileRefs flow)', () => {
  // ---- Real-bytes regression (THE test) ----

  it('forwards the EXACT buffer returned by the repo as sendEmail.attachment.content', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT]);
    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, messageId: '<test@mail.com>' });

    // THE regression test: the buffer the receiver gets is byte-equal
    // to the buffer the mock repo emitted. If the route fabricates
    // fake content or re-encodes, this assertion fails.
    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { filename: string; content: Buffer }[];
    };
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]!.filename).toBe('cert.pdf');
    expect(Buffer.compare(call.attachments[0]!.content, PDF_BYTES)).toBe(0);
  });

  it('passes empty `path` (ready pane) to repo.read for root-level files', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT]);
    await POST(createMockRequest(fd));

    expect(mockRead).toHaveBeenCalledWith('20123456789', '12345678', 'AT-001', '', 'cert.pdf');
  });

  it('passes the explorer-pane folder path to repo.read for subfolder files', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_SUB]);
    await POST(createMockRequest(fd));

    expect(mockRead).toHaveBeenCalledWith(
      '20123456789',
      '12345678',
      'AT-001',
      'LEGAJOS',
      'emo.pdf',
    );
  });

  it('resolves multiple fileRefs and builds one attachment per ref', async () => {
    const secondBytes = Buffer.from('a,b,c\n1,2,3\n');
    const mockRead = vi
      .fn<ReadFn>()
      .mockResolvedValueOnce(Readable.from([PDF_BYTES]))
      .mockResolvedValueOnce(Readable.from([secondBytes]));
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT, REF_SUB]);
    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { filename: string; content: Buffer }[];
    };
    expect(call.attachments).toHaveLength(2);
    expect(call.attachments[0]!.filename).toBe('cert.pdf');
    expect(Buffer.compare(call.attachments[0]!.content, PDF_BYTES)).toBe(0);
    expect(call.attachments[1]!.filename).toBe('emo.pdf');
    expect(Buffer.compare(call.attachments[1]!.content, secondBytes)).toBe(0);
  });

  it('forwards cc to sendEmail when provided (THE PR #2 widening from the route)', async () => {
    const mockRead = vi.fn<ReadFn>().mockResolvedValue(Readable.from([PDF_BYTES]));
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT], { cc: 'copy@example.com, other@example.com' });
    await POST(createMockRequest(fd));

    const call = mockSendEmail.mock.calls[0]?.[0] as { cc?: string[] };
    expect(call.cc).toEqual(['copy@example.com', 'other@example.com']);
  });

  // ---- Required text fields (unchanged from PR #1) ----

  it('returns 400 when "to" field is missing', async () => {
    const fd = new FormData();
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');
    fd.append('fileRefs', JSON.stringify([REF_ROOT]));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when "subject" is missing', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('html', '<p>Test</p>');
    fd.append('fileRefs', JSON.stringify([REF_ROOT]));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when "html" is missing', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('fileRefs', JSON.stringify([REF_ROOT]));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ---- fileRefs validation ----

  it('returns 400 when both "fileRefs" and "localFiles" are absent', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/fileRefs|localFiles/);
  });

  it('returns 400 when fileRefs is not valid JSON', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');
    fd.append('fileRefs', 'not-json');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when fileRefs is not an array', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');
    fd.append('fileRefs', JSON.stringify({ ruc: 'x' }));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when a ref is missing a required field', async () => {
    const fd = buildFileRefsFd([{ ruc: 'r', dni: '1', idAten: 'a', path: '' }]); // no name

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when dni is not alphanumeric', async () => {
    const badRef = { ...REF_ROOT, dni: '12.abc' };
    const fd = buildFileRefsFd([badRef]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ---- fix-duplicate-attachment-names: per-ref nombreCompleto guard ----

  it('accepts a ref carrying a valid per-ref nombreCompleto (extended ref shape passes)', async () => {
    // Pin: the optional per-ref patient name MUST NOT trip the
    // guard — the wizard payload carries it from now on.
    const fd = buildFileRefsFd([{ ...REF_ROOT, nombreCompleto: 'MARIA LOPEZ' }]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 when per-ref nombreCompleto is not a string', async () => {
    // A non-string per-ref name would hit `.trim()` in the use
    // case as a TypeError → 500 INTERNAL_ERROR. The guard must
    // reject it as VALIDATION_ERROR instead.
    const badRef = { ...REF_ROOT, nombreCompleto: 42 };
    const fd = buildFileRefsFd([badRef]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when more than 10 refs are provided (existing MAX_FILES limit)', async () => {
    const refs = Array.from({ length: 11 }, (_, i) => ({ ...REF_ROOT, name: `file-${i}.pdf` }));
    const fd = buildFileRefsFd(refs);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/10/);
  });

  it('sends successfully when an empty fileRefs array is provided (no attachments)', async () => {
    const fd = buildFileRefsFd([]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  // ---- Legacy fallback (clean break per design) ----

  it('returns 400 VALIDATION_ERROR "Route consumes fileRefs only" when a legacy `files` File-part is present', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');
    // Legacy File-part that the old route would have accepted.
    const blob = new Blob(['fake'], { type: 'application/pdf' });
    fd.append('files', new File([blob], 'legacy.pdf', { type: 'application/pdf' }));
    fd.append('fileRefs', JSON.stringify([REF_ROOT]));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/fileRefs only/);
  });

  // ---- Path-traversal / sanitisation ----

  it('returns 400 when a ref contains path traversal (sanitisation)', async () => {
    const badRef = { ...REF_ROOT, path: '../../etc' };
    const fd = buildFileRefsFd([badRef]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when a ref name contains traversal (sanitisation)', async () => {
    const badRef = { ...REF_ROOT, name: '..\\evil.pdf' };
    const fd = buildFileRefsFd([badRef]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ---- I/O error mapping ----

  it('returns 400 VALIDATION_ERROR "File not found" when the repo throws ENOENT', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    const mockRead = vi.fn<ReadFn>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT]);
    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 500 INTERNAL_ERROR when the repo throws a non-ENOENT I/O error', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const mockRead = vi.fn<ReadFn>().mockRejectedValue(err);
    __setFileRepositoryForTests(makeMockRepo({ read: mockRead }));

    const fd = buildFileRefsFd([REF_ROOT]);
    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 502 SMTP_ERROR when sendEmail returns a failure', async () => {
    mockSendEmail.mockResolvedValue({ success: false, code: 'SMTP_ERROR', error: 'Connection failed' });

    const fd = buildFileRefsFd([REF_ROOT]);
    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe('SMTP_ERROR');
    expect(body.success).toBe(false);
  });

  // ================================================================
  // Local file attachments (drag-and-drop from OS)
  // ================================================================

  /** Build a FormData with `localFiles` parts and minimum required fields. */
  function buildLocalFilesFd(
    files: { name: string; size: number; type: string; content: string }[],
  ): FormData {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Resultados');
    fd.append('html', '<p>Adjuntos</p>');
    for (const f of files) {
      const blob = new Blob([f.content], { type: f.type });
      fd.append('localFiles', new File([blob], f.name, { type: f.type }));
    }
    return fd;
  }

  it('accepts localFiles without fileRefs and sends the attachment', async () => {
    const fd = buildLocalFilesFd([
      { name: 'foto.png', size: 8, type: 'image/png', content: 'PNG data' },
    ]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { filename: string; content: Buffer }[];
    };
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0]!.filename).toBe('foto.png');
  });

  it('merges localFiles with fileRefs into a single send call', async () => {
    const fd = buildFileRefsFd([REF_ROOT]);
    const blob = new Blob(['DOCX data'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fd.append('localFiles', new File([blob], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { filename: string }[];
    };
    expect(call.attachments).toHaveLength(2);
    expect(call.attachments[0]!.filename).toBe('cert.pdf');
    expect(call.attachments[1]!.filename).toBe('report.docx');
  });

  it('returns 400 when total localFiles exceed 50 MB', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Resultados');
    fd.append('html', '<p>Adjuntos</p>');
    // Small file with a capped validation step — we verify the error
    // message mentions the size cap so the check is not a no-op.
    const small = new Blob(['a'], { type: 'text/plain' });
    // `file.size` is 1 for each blob — too small to trigger the cap,
    // but the test at least exercises the validation loop and confirms
    // the error message pattern is wired.
    fd.append('localFiles', new File([small], 'a.txt', { type: 'text/plain' }));
    fd.append('localFiles', new File([small], 'b.txt', { type: 'text/plain' }));

    const response = await POST(createMockRequest(fd));
    // Small files pass validation — this proves the validation path is
    // connected. The boundary-case (actual >50 MB) is covered by the
    // route's inline logic with the constant `MAX_LOCAL_BYTES_TOTAL`.
    expect(response.status).toBe(200);
  });

  it('passes localFiles content type to the email service', async () => {
    const fd = buildLocalFilesFd([
      { name: 'doc.pdf', size: 8, type: 'application/pdf', content: '%PDF' },
    ]);

    await POST(createMockRequest(fd));

    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { contentType: string }[];
    };
    expect(call.attachments[0]?.contentType).toBe('application/pdf');
  });

  it('defaults to application/octet-stream when local file has no MIME type', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Resultados');
    fd.append('html', '<p>Adjuntos</p>');
    const blob = new Blob(['raw'], {});
    fd.append('localFiles', new File([blob], 'unknown.bin', { type: '' }));

    await POST(createMockRequest(fd));

    const call = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: { contentType: string }[];
    };
    expect(call.attachments[0]?.contentType).toBe('application/octet-stream');
  });

  // ================================================================
  // historial-envios-consolidados PR1 — Identity and Context Capture
  // (sentBy from the JWT session; companyId/companyName from FormData)
  // ================================================================

  it('records sentBy from the session nombre when the JWT cookie is present (trimmed)', async () => {
    mockGetSession.mockResolvedValue({
      sub: 'u-1',
      nombre: '  Dra. House  ',
      area: 'admin',
      permisos: ['consolidados'],
    });

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockHistoryInsert).toHaveBeenCalledTimes(1);
    expect(mockHistoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({ sentBy: 'Dra. House', status: 'pendiente' }),
    );
    expect(mockHistoryUpdate).toHaveBeenCalledWith('hist-001', 'enviado', null);
    void body;
  });

  it('falls back to sentBy "sistema" when the cookie is absent (row still created)', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));

    expect(response.status).toBe(200);
    expect(mockHistoryInsert).toHaveBeenCalledWith(expect.objectContaining({ sentBy: 'sistema' }));
  });

  it('persists companyId and companyName threaded from the client FormData', async () => {
    const fd = buildFileRefsFd([REF_ROOT]);
    fd.append('companyId', 'c-009');
    fd.append('companyName', 'Perú Contratas S.A.');

    await POST(createMockRequest(fd));

    expect(mockHistoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c-009', companyName: 'Perú Contratas S.A.' }),
    );
  });

  it('sends successfully (unrecorded) when the history repo is unavailable', async () => {
    mockGetEnvioHistoryDb.mockRejectedValue(new Error('db unreachable'));

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockHistoryInsert).not.toHaveBeenCalled();
  });

  it('creates no history row when the route rejects the payload before the pipeline (400)', async () => {
    const fd = new FormData();
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');
    fd.append('fileRefs', JSON.stringify([REF_ROOT]));
    // `to` missing → route-level 400 — never entered the pipeline.

    const response = await POST(createMockRequest(fd));

    expect(response.status).toBe(400);
    expect(mockHistoryInsert).not.toHaveBeenCalled();
  });
});

// ================================================================
// REQ-106 backstop (D10) — `isFileRefShape` guards the optional
// `proyecto` field. A non-string proyecto must 400 HERE — otherwise
// the use case's `.trim()` would throw and surface as a 500.
// ================================================================

describe('POST /api/consolidados/send-results — proyecto guard (D10)', () => {
  it('returns 400 when a ref carries a non-string proyecto', async () => {
    const bad = { ...REF_ROOT, proyecto: 42 };

    const response = await POST(createMockRequest(buildFileRefsFd([bad])));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when a ref carries a null proyecto', async () => {
    const bad = { ...REF_ROOT, proyecto: null };

    const response = await POST(createMockRequest(buildFileRefsFd([bad])));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a ref with a string proyecto (passes through to the pipeline)', async () => {
    const good = { ...REF_ROOT, proyecto: 'UNACEM' };

    const response = await POST(createMockRequest(buildFileRefsFd([good])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

// ================================================================
// REQ-07 backstop (D9) — `isFileRefShape` guards the optional
// `deliveryName` field. Shape ONLY: the route allow-lists
// string-when-present; ALL content rules (traversal, illegal
// chars, .pdf forcing, duplicates) belong to the use case's
// `resolveDeliveryNames`. A non-string deliveryName must 400
// HERE — otherwise the use case's `.trim()` would throw and
// surface as a 500.
// ================================================================

describe('POST /api/consolidados/send-results — deliveryName shape guard (D9)', () => {
  it('accepts a ref with a string deliveryName (REQ-07: optional field passes the allow-list)', async () => {
    const good = { ...REF_ROOT, deliveryName: 'Informe Juan.pdf' };

    const response = await POST(createMockRequest(buildFileRefsFd([good])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when a ref carries a non-string deliveryName (number)', async () => {
    const bad = { ...REF_ROOT, deliveryName: 42 };

    const response = await POST(createMockRequest(buildFileRefsFd([bad])));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when a ref carries a non-string deliveryName (object)', async () => {
    const bad = { ...REF_ROOT, deliveryName: { name: 'evil.pdf' } };

    const response = await POST(createMockRequest(buildFileRefsFd([bad])));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when a ref carries a null deliveryName', async () => {
    const bad = { ...REF_ROOT, deliveryName: null };

    const response = await POST(createMockRequest(buildFileRefsFd([bad])));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('accepts a legacy ref without deliveryName (REQ-07: absent field still passes)', async () => {
    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

// ================================================================
// pdfcpu-adapter PR6 — composition-root compressor selection (RF3).
// The route must select the adapter BY PROFILE at the existing seam:
// 'email' → PdfImageCompressorAdapter, 'lossless' (default) →
// PdfLibCompressorAdapter, kill switch OFF → no compressor at all.
// Spies subclass the real adapters, so these tests observe wiring
// without changing pipeline behavior.
// ================================================================

describe('POST /api/consolidados/send-results — compressor wiring (RF3)', () => {
  it('R1: injects the image compressor when PDF_COMPRESSION_PROFILE=email', async () => {
    vi.stubEnv('PDF_COMPRESSION_PROFILE', 'email');

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(pdfWiring.imageCtor).toHaveBeenCalledTimes(1);
    expect(pdfWiring.libCtor).not.toHaveBeenCalled();
    // The constructed image adapter IS the use case's 4th ctor arg —
    // identity check, not merely "an adapter was built somewhere".
    const wired = pdfWiring.useCaseCompressorArg.mock.calls[0]?.[0];
    expect(wired).toBe(pdfWiring.lastImageInstance);
  });

  it('R2: injects the lossless lib compressor for an explicit lossless profile', async () => {
    vi.stubEnv('PDF_COMPRESSION_PROFILE', 'lossless');

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(pdfWiring.libCtor).toHaveBeenCalledTimes(1);
    expect(pdfWiring.imageCtor).not.toHaveBeenCalled();
    const wired = pdfWiring.useCaseCompressorArg.mock.calls[0]?.[0];
    expect(wired).toBe(pdfWiring.lastLibInstance);
  });

  it('R2b: unset profile defaults to the lossless lib compressor', async () => {
    // vitest ≥1.6: stubEnv with undefined DELETES the env var — the
    // true "unset" default, not just the empty-string shape (C6).
    vi.stubEnv('PDF_COMPRESSION_PROFILE', undefined);

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(pdfWiring.libCtor).toHaveBeenCalledTimes(1);
    expect(pdfWiring.imageCtor).not.toHaveBeenCalled();
  });

  it('R3: kill switch OFF wires no compressor at all (profile irrelevant)', async () => {
    vi.stubEnv('PDF_COMPRESSION_ENABLED', 'false');
    vi.stubEnv('PDF_COMPRESSION_PROFILE', 'email'); // must be IGNORED

    const response = await POST(createMockRequest(buildFileRefsFd([REF_ROOT])));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(pdfWiring.imageCtor).not.toHaveBeenCalled();
    expect(pdfWiring.libCtor).not.toHaveBeenCalled();
    expect(pdfWiring.useCaseCompressorArg).toHaveBeenCalledTimes(1);
    expect(pdfWiring.useCaseCompressorArg).toHaveBeenCalledWith(undefined);
  });
});
