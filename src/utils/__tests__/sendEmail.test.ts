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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
    }
  });

  it('should reuse the same transport on subsequent calls within the same purpose', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<first@outlook.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'First', html: '<p>1</p>', purpose: 'facturacion' });
    await sendEmail({ to: ['c@d.com'], subject: 'Second', html: '<p>2</p>', purpose: 'facturacion' });

    // createTransport should have been called only once — cache hit within the same purpose
    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('should return SMTP_ERROR when SMTP_USER is missing', async () => {
    delete process.env.SMTP_USER_FACTURACION;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      purpose: 'facturacion',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_USER');
    }
  });

  it('should return SMTP_ERROR when SMTP_PASS is missing', async () => {
    delete process.env.SMTP_PASS_FACTURACION;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      purpose: 'facturacion',
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
    delete process.env.SMTP_USER_FACTURACION;
    delete process.env.SMTP_PASS_FACTURACION;

    const result = await sendEmail({
      to: ['test@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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
      purpose: 'facturacion',
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

    await sendEmail({ to: ['a@b.com'], subject: 'Cobre', html: '<p>1</p>', purpose: 'facturacion' });
    await sendEmail({ to: ['c@d.com'], subject: 'Consolidado', html: '<p>2</p>', purpose: 'consolidados' });

    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(2);
  });

  it('reuses the cached transport for the same purpose (S-CONSCRED-013)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<b@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'First', html: '<p>1</p>', purpose: 'consolidados' });
    await sendEmail({ to: ['c@d.com'], subject: 'Second', html: '<p>2</p>', purpose: 'consolidados' });

    const nodemailer = await import('nodemailer');
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('from field follows the resolved user, not a re-read of process.env (S-CONSCRED-005)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<from@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'From', html: '<p>1</p>', purpose: 'facturacion' });

    // WU-2: from follows the per-purpose resolved user (SMTP_USER_FACTURACION),
    // NOT a re-read of the legacy SMTP_USER. beforeEach seeds
    // SMTP_USER_FACTURACION='facturacion@example.com' and SMTP_USER='test@example.com'.
    expect(mockSendMail.mock.calls[0]?.[0]?.from).toBe('facturacion@example.com');
  });
});

// ---- __resetTransport seam (WU-1) ----

describe('__resetTransport(purpose?)', () => {
  it('clears all transports when called with no argument (S-CONSCRED-015)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'A', html: '<p>1</p>', purpose: 'facturacion' });
    await sendEmail({ to: ['c@d.com'], subject: 'B', html: '<p>2</p>', purpose: 'consolidados' });

    const nodemailer = await import('nodemailer');
    vi.mocked(nodemailer.default.createTransport).mockClear();

    __resetTransport();

    await sendEmail({ to: ['e@f.com'], subject: 'C', html: '<p>3</p>', purpose: 'facturacion' });
    expect(nodemailer.default.createTransport).toHaveBeenCalledTimes(1);
  });

  it('clears only the given purpose when called with an argument (S-CONSCRED-016)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r2@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'A', html: '<p>1</p>', purpose: 'facturacion' });
    await sendEmail({ to: ['c@d.com'], subject: 'B', html: '<p>2</p>', purpose: 'consolidados' });

    const nodemailer = await import('nodemailer');
    vi.mocked(nodemailer.default.createTransport).mockClear();

    __resetTransport('consolidados');

    // facturacion should reuse the cached transport — no new createTransport
    await sendEmail({ to: ['e@f.com'], subject: 'C', html: '<p>3</p>', purpose: 'facturacion' });
    expect(nodemailer.default.createTransport).not.toHaveBeenCalled();

    // consolidados should create a fresh transport — cache was cleared for that purpose
    await sendEmail({ to: ['g@h.com'], subject: 'D', html: '<p>4</p>', purpose: 'consolidados' });
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

// ---- Per-purpose resolver (WU-2) ----

type TransportConfig = { auth: { user: string; pass: string } };

async function lastTransportAuth(): Promise<TransportConfig> {
  const nodemailer = await import('nodemailer');
  const call = vi.mocked(nodemailer.default.createTransport).mock.calls.at(-1)?.[0] as TransportConfig;
  return call;
}

describe('per-purpose resolver (WU-2)', () => {
  it('facturacion reads SMTP_USER_FACTURACION / SMTP_PASS_FACTURACION (S-CONSCRED-003)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<f@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    const auth = (await lastTransportAuth()).auth;
    expect(auth.user).toBe('facturacion@example.com');
    expect(auth.pass).toBe('facturacion-secret');
    expect(mockSendMail.mock.calls[0]?.[0]?.from).toBe('facturacion@example.com');
  });

  it('consolidados reads SMTP_USER_CONSOLIDADOS / SMTP_PASS_CONSOLIDADOS (S-CONSCRED-004)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<c@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'C', html: '<p>1</p>', purpose: 'consolidados' });

    const auth = (await lastTransportAuth()).auth;
    expect(auth.user).toBe('consolidados@example.com');
    expect(auth.pass).toBe('consolidados-secret');
    expect(mockSendMail.mock.calls[0]?.[0]?.from).toBe('consolidados@example.com');
  });

  it('facturacion missing SMTP_USER_FACTURACION fails fast (S-CONSCRED-022)', async () => {
    delete process.env.SMTP_USER_FACTURACION;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_USER_FACTURACION');
      expect(result.error).toContain('facturacion');
    }
  });

  it('facturacion missing SMTP_PASS_FACTURACION fails fast (S-CONSCRED-023)', async () => {
    delete process.env.SMTP_PASS_FACTURACION;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_PASS_FACTURACION');
    }
  });

  it('facturacion missing both vars lists both names (S-CONSCRED-024)', async () => {
    delete process.env.SMTP_USER_FACTURACION;
    delete process.env.SMTP_PASS_FACTURACION;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('SMTP_USER_FACTURACION');
      expect(result.error).toContain('SMTP_PASS_FACTURACION');
    }
  });

  it('consolidados missing SMTP_USER_CONSOLIDADOS fails fast (S-CONSCRED-008)', async () => {
    delete process.env.SMTP_USER_CONSOLIDADOS;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'C', html: '<p>1</p>', purpose: 'consolidados' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_USER_CONSOLIDADOS');
    }
  });

  it('consolidados missing SMTP_PASS_CONSOLIDADOS fails fast (S-CONSCRED-009)', async () => {
    delete process.env.SMTP_PASS_CONSOLIDADOS;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'C', html: '<p>1</p>', purpose: 'consolidados' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('SMTP_ERROR');
      expect(result.error).toContain('SMTP_PASS_CONSOLIDADOS');
    }
  });

  it('consolidados missing both vars lists both names (S-CONSCRED-010)', async () => {
    delete process.env.SMTP_USER_CONSOLIDADOS;
    delete process.env.SMTP_PASS_CONSOLIDADOS;

    const result = await sendEmail({ to: ['a@b.com'], subject: 'C', html: '<p>1</p>', purpose: 'consolidados' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('SMTP_USER_CONSOLIDADOS');
      expect(result.error).toContain('SMTP_PASS_CONSOLIDADOS');
    }
  });

  it('no silent cross-purpose fallback (S-CONSCRED-011)', async () => {
    delete process.env.SMTP_USER_FACTURACION;
    delete process.env.SMTP_PASS_FACTURACION;
    // consolidados vars are still set — facturacion MUST NOT fall back to them.

    const result = await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('SMTP_USER_FACTURACION');
      expect(result.error).not.toContain('SMTP_USER_CONSOLIDADOS');
    }
  });

  it('cobre path is unaffected when consolidado vars are set (S-CONSCRED-006)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<iso@x.com>' });

    await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    const auth = (await lastTransportAuth()).auth;
    expect(auth.user).toBe('facturacion@example.com');
    expect(auth.user).not.toBe('consolidados@example.com');
  });

  it('password is never logged on any purpose path (S-CONSCRED-007/026)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendMail.mockRejectedValue(new Error('Invalid login: 535 Authentication failed'));

    await sendEmail({ to: ['a@b.com'], subject: 'F', html: '<p>1</p>', purpose: 'facturacion' });

    const allOutput = [
      ...errSpy.mock.calls.flat().map(String),
      ...logSpy.mock.calls.flat().map(String),
      ...warnSpy.mock.calls.flat().map(String),
    ].join('\n');

    expect(allOutput).not.toContain('facturacion-secret');
    expect(allOutput).not.toContain('consolidados-secret');

    errSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ---- Parameterized scalability (REQ-9) ----

describe('parameterized scalability (REQ-9)', () => {
  for (const purpose of ['consolidados', 'facturacion'] as const) {
    it(`resolves ${purpose} env vars correctly (S-CONSCRED-025)`, async () => {
      mockSendMail.mockResolvedValue({ messageId: `<${purpose}@x.com>` });

      await sendEmail({ to: ['a@b.com'], subject: 'P', html: '<p>1</p>', purpose });

      const userKey = `SMTP_USER_${purpose.toUpperCase()}`;
      const passKey = `SMTP_PASS_${purpose.toUpperCase()}`;
      const auth = (await lastTransportAuth()).auth;
      expect(auth.user).toBe(process.env[userKey]);
      expect(auth.pass).toBe(process.env[passKey]);
      expect(mockSendMail.mock.calls[0]?.[0]?.from).toBe(process.env[userKey]);
    });
  }
});
