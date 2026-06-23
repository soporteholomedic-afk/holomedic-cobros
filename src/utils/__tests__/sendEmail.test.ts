import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock functions so they're available in vi.mock factory (vitest hoists mock calls)
const mockSendMail = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

import { sendEmail, __resetTransport } from '../sendEmail';

beforeEach(() => {
  vi.clearAllMocks();
  __resetTransport();
  mockSendMail.mockReset();

  // Set default env vars before each test — all 6 SMTP vars (shared + both
  // purposes) plus the legacy pair so WU-1's resolver stub (which still reads
  // SMTP_USER / SMTP_PASS) keeps the pre-existing 17 tests green.
  process.env.SMTP_HOST = 'smtp.office365.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASS = 'secret';
  process.env.SMTP_USER_FACTURACION = 'facturacion@example.com';
  process.env.SMTP_PASS_FACTURACION = 'facturacion-secret';
  process.env.SMTP_USER_CONSOLIDADOS = 'consolidados@example.com';
  process.env.SMTP_PASS_CONSOLIDADOS = 'consolidados-secret';
});

// Env-restore: vi.clearAllMocks() does NOT clear process.env. Deleting the
// per-purpose vars prevents a stray test from leaking state into the next.
afterEach(() => {
  delete process.env.SMTP_USER_FACTURACION;
  delete process.env.SMTP_PASS_FACTURACION;
  delete process.env.SMTP_USER_CONSOLIDADOS;
  delete process.env.SMTP_PASS_CONSOLIDADOS;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
});

describe('sendEmail', () => {
  it('should return success with messageId on successful send', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<abc123@outlook.com>' });

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test Subject',
      html: '<p>Hola</p>',
    });

    expect(result).toEqual({
      success: true,
      messageId: '<abc123@outlook.com>',
    });
  });

  it('should call transport.sendMail with correct params', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<abc@outlook.com>' });

    await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Estado de cuenta',
      html: '<h1>Test</h1>',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['cliente@example.com'],
        subject: 'Estado de cuenta',
        html: '<h1>Test</h1>',
      })
    );
  });

  it('should return SMTP_ERROR when env vars are missing', async () => {
    delete process.env.SMTP_HOST;

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP');
    }
  });

  it('should return SMTP_ERROR when SMTP_PORT is missing', async () => {
    delete process.env.SMTP_PORT;

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
    }
  });

  it('should return SMTP_AUTH_ERROR on authentication failure', async () => {
    const authError = new Error('Invalid login: 535 Authentication failed');
    authError.name = 'AuthError';
    mockSendMail.mockRejectedValue(authError);

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_AUTH_ERROR');
      expect(result.error).toContain('authentication failed');
    }
  });

  it('should return SMTP_TIMEOUT on connection timeout', async () => {
    const timeoutError = new Error('Connection timed out');
    (timeoutError as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    mockSendMail.mockRejectedValue(timeoutError);

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_TIMEOUT');
    }
  });

  it('should return SMTP_ERROR for unexpected errors', async () => {
    mockSendMail.mockRejectedValue(new Error('Connection refused'));

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
    }
  });

  it('should reuse the same transport on subsequent calls within the same purpose', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<first@outlook.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'First', html: '<p>1</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    await sendEmail({ to: ['c@d.com'], subject: 'Second', html: '<p>2</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);

    // createTransport should have been called only once — cache hit within the same purpose
    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('should return SMTP_ERROR when SMTP_USER is missing', async () => {
    delete process.env.SMTP_USER;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_USER');
    }
  });

  it('should return SMTP_ERROR when SMTP_PASS is missing', async () => {
    delete process.env.SMTP_PASS;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_PASS');
    }
  });

  it('should return SMTP_ERROR when all env vars are missing', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_HOST');
      expect(result.error).toContain('SMTP_PORT');
      expect(result.error).toContain('SMTP_USER');
      expect(result.error).toContain('SMTP_PASS');
    }
  });

  it('should handle nodemailer errors with "credentials" in the message', async () => {
    mockSendMail.mockRejectedValue(new Error('Invalid credentials'));

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_AUTH_ERROR');
    }
  });

  it('should accept multiple To recipients as an array', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<multi@outlook.com>' });

    const result = await sendEmail({
      to: ['a@b.com', 'c@d.com'],
      subject: 'Multi',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@b.com', 'c@d.com'],
      })
    );
  });

  it('should pass CC recipients to nodemailer when provided', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<cc@outlook.com>' });

    const result = await sendEmail({
      to: ['primary@b.com'],
      cc: ['cc@b.com'],
      subject: 'With CC',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['primary@b.com'],
        cc: ['cc@b.com'],
      })
    );
  });

  // ---- Attachment tests (PR #2 - Consolidados) ----

  it('should pass attachments to nodemailer when provided', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<attach@outlook.com>' });

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'With attachments',
      html: '<p>Adjuntos</p>',
      attachments: [
        { filename: 'report.pdf', content: Buffer.from('fake-pdf'), contentType: 'application/pdf' },
        { filename: 'results.csv', content: 'a,b,c\n1,2,3' },
      ],
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['cliente@example.com'],
        subject: 'With attachments',
        html: '<p>Adjuntos</p>',
        attachments: [
          { filename: 'report.pdf', content: Buffer.from('fake-pdf'), contentType: 'application/pdf' },
          { filename: 'results.csv', content: 'a,b,c\n1,2,3' },
        ],
      })
    );
  });

  it('should send email without attachments when none provided (backward compat)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<no-attach@outlook.com>' });

    const result = await sendEmail({
      to: ['cliente@example.com'],
      subject: 'No attachments',
      html: '<p>Sin adjuntos</p>',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.not.objectContaining({ attachments: expect.anything() })
    );
  });

  it('should accept string content attachments', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<str-attach@outlook.com>' });

    await sendEmail({
      to: ['cliente@example.com'],
      subject: 'String content',
      html: '<p>Test</p>',
      attachments: [
        { filename: 'note.txt', content: 'plain text content' },
      ],
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: 'note.txt', content: 'plain text content' },
        ],
      })
    );
  });
});

// ---- Per-purpose transport cache (WU-1) ----

describe('per-purpose transport cache', () => {
  it('creates distinct transports for different purposes (S-CONSCRED-012)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<a@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'Cobre', html: '<p>1</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    await sendEmail({ to: ['c@d.com'], subject: 'Consolidado', html: '<p>2</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);

    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(2);
  });

  it('reuses the cached transport for the same purpose (S-CONSCRED-013)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<b@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'First', html: '<p>1</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);
    await sendEmail({ to: ['c@d.com'], subject: 'Second', html: '<p>2</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);

    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('from field follows the resolved user, not a re-read of process.env (S-CONSCRED-005)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<from@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'From', html: '<p>1</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);

    expect(mockSendMail.mock.calls[0]?.[0]?.from).toBe('test@example.com');
  });
});

// ---- __resetTransport seam (WU-1) ----

describe('__resetTransport(purpose?)', () => {
  it('clears all transports when called with no argument (S-CONSCRED-015)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'A', html: '<p>1</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    await sendEmail({ to: ['c@d.com'], subject: 'B', html: '<p>2</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);

    const nodemailer = await import('nodemailer');
    vi.mocked(nodemailer.default.createTransport).mockClear();

    __resetTransport();

    await sendEmail({ to: ['e@f.com'], subject: 'C', html: '<p>3</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('clears only the given purpose when called with an argument (S-CONSCRED-016)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r2@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'A', html: '<p>1</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    await sendEmail({ to: ['c@d.com'], subject: 'B', html: '<p>2</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);

    const nodemailer = await import('nodemailer');
    vi.mocked(nodemailer.default.createTransport).mockClear();

    __resetTransport('consolidados' as Parameters<typeof __resetTransport>[0]);

    // facturacion should reuse the cached transport — no new createTransport
    await sendEmail({ to: ['e@f.com'], subject: 'C', html: '<p>3</p>', purpose: 'facturacion' } as Parameters<typeof sendEmail>[0]);
    expect(nodemailer.default.createTransport).not.toHaveBeenCalled();

    // consolidados should create a fresh transport — cache was cleared for that purpose
    await sendEmail({ to: ['g@h.com'], subject: 'D', html: '<p>4</p>', purpose: 'consolidados' } as Parameters<typeof sendEmail>[0]);
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });
});

// ---- MissingSmtpCredsError class (WU-1 declares, WU-2 throws) ----

describe('MissingSmtpCredsError', () => {
  it('is an exported Error subclass with purpose and missing fields', async () => {
    const mod = await import('../sendEmail');
    const MissingSmtpCredsError = (mod as Record<string, unknown>).MissingSmtpCredsError as
      | (new (purpose: string, missing: string[]) => Error)
      | undefined;

    expect(MissingSmtpCredsError).toBeDefined();

    const err = new MissingSmtpCredsError!('consolidados', ['SMTP_USER_CONSOLIDADOS']);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('SMTP not configured for consolidados: missing SMTP_USER_CONSOLIDADOS');
    expect((err as { purpose: string }).purpose).toBe('consolidados');
    expect((err as { missing: string[] }).missing).toEqual(['SMTP_USER_CONSOLIDADOS']);
  });
});
