import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setFileRepositoryForTests } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

// ---- Mock sendEmail (the SMTP transport) ----

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

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
});

afterEach(() => {
  __setFileRepositoryForTests(null);
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

  it('returns 400 when "fileRefs" field is missing', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toMatch(/fileRefs/);
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

  it('returns 400 when dni is not numeric', async () => {
    const badRef = { ...REF_ROOT, dni: '12abc' };
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

  it('returns 400 when an empty fileRefs array is provided', async () => {
    const fd = buildFileRefsFd([]);

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
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
});
