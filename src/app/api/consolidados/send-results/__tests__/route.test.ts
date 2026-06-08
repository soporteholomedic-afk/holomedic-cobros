import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock sendEmail ----

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// ---- Import the handler being tested ----

import { POST } from '../route';

// ---- Helpers ----

function createMockRequest(body?: FormData): Request {
  return {
    formData: () => Promise.resolve(body ?? new FormData()),
  } as Request;
}

/** Create a small File stub (Blob with name) */
function createFileStub(
  name: string,
  content: string,
  type = 'application/pdf',
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

/** Create a File stub with a specific byte size (filled with 'x') */
function createFileOfSize(name: string, sizeBytes: number, type = 'application/pdf'): File {
  const content = 'x'.repeat(sizeBytes);
  return createFileStub(name, content, type);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ success: true, messageId: '<test@mail.com>' });
});

describe('POST /api/consolidados/send-results', () => {
  it('should return 200 with messageId when sending with files', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Resultados');
    fd.append('html', '<p>Resultados adjuntos</p>');
    fd.append('files', createFileStub('report.pdf', 'fake-pdf-content'));
    fd.append('files', createFileStub('results.csv', 'a,b,c\n1,2,3'));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, messageId: '<test@mail.com>' });

    // Verify sendEmail was called with attachments
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['cliente@example.com'],
        subject: 'Resultados',
        html: '<p>Resultados adjuntos</p>',
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: 'report.pdf' }),
          expect.objectContaining({ filename: 'results.csv' }),
        ]),
      }),
    );
    expect(mockSendEmail.mock.calls[0][0].attachments).toHaveLength(2);
  });

  it('should return 200 without attachments when no files provided (backward compat)', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Sin archivos');
    fd.append('html', '<p>Sin adjuntos</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, messageId: '<test@mail.com>' });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.not.objectContaining({ attachments: expect.anything() }),
    );
  });

  it('should return 400 when "to" field is missing', async () => {
    const fd = new FormData();
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.success).toBe(false);
  });

  it('should return 400 when "to" is empty', async () => {
    const fd = new FormData();
    fd.append('to', '');
    fd.append('subject', 'Test');
    fd.append('html', '<p>Test</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when "subject" is missing', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('html', '<p>Test</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when "html" is missing', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Test');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when more than 10 files are provided', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Many files');
    fd.append('html', '<p>Demasiados archivos</p>');

    for (let i = 0; i < 11; i++) {
      fd.append('files', createFileStub(`file-${i}.pdf`, `content-${i}`));
    }

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('10');
  });

  it('should return 400 when total file size exceeds 10MB', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Large files');
    fd.append('html', '<p>Archivos grandes</p>');

    // Two ~6MB files = 12MB total (exceeds 10MB limit)
    fd.append('files', createFileOfSize('big1.pdf', 6_000_000));
    fd.append('files', createFileOfSize('big2.pdf', 6_000_000));

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('10MB');
  });

  it('should accept 10 files under 10MB total', async () => {
    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Many small files');
    fd.append('html', '<p>10 archivos pequeños</p>');

    for (let i = 0; i < 10; i++) {
      fd.append('files', createFileOfSize(`small-${i}.pdf`, 500_000));
    }

    const response = await POST(createMockRequest(fd));
    expect(response.status).toBe(200);
  });

  it('should return SMTP_ERROR when sendEmail returns error', async () => {
    mockSendEmail.mockResolvedValue({ success: false, code: 'SMTP_ERROR', error: 'Connection failed' });

    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Fail');
    fd.append('html', '<p>Fail</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe('SMTP_ERROR');
    expect(body.success).toBe(false);
  });

  it('should return INTERNAL_ERROR on unexpected errors', async () => {
    mockSendEmail.mockRejectedValue(new Error('Unexpected'));

    const fd = new FormData();
    fd.append('to', 'cliente@example.com');
    fd.append('subject', 'Crash');
    fd.append('html', '<p>Crash</p>');

    const response = await POST(createMockRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.success).toBe(false);
  });
});
