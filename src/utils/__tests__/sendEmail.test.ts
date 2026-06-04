import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  // Set default env vars before each test
  process.env.SMTP_HOST = 'smtp.office365.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASS = 'secret';
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
    (timeoutError as any).code = 'ETIMEDOUT';
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

  it('should reuse the same transport on subsequent calls (lazy singleton)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<first@outlook.com>' });

    await sendEmail({       to: ['a@b.com'], subject: 'First', html: '<p>1</p>' });
    await sendEmail({       to: ['c@d.com'], subject: 'Second', html: '<p>2</p>' });

    // createTransport should have been called only once
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
