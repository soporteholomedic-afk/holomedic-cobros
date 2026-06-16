import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock sendEmail ----

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// ---- Import after mocks ----

import { EmailService, makeEmailService } from '../emailService';

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockReset();
});

/**
 * PR #2 — the `IEmailService` port was widened to accept an options
 * object so the use case can forward `cc` to SMTP. The adapter
 * (`EmailService`) implements the port, and `makeEmailService()` is
 * the factory the route uses to obtain an instance.
 *
 * Tests cover:
 * - happy path returns success with messageId
 * - cc is forwarded to sendEmail when provided
 * - cc is omitted from the sendEmail call when not provided
 * - sendEmail failure surfaces as `success: false, error`
 * - thrown errors are caught and surface as `success: false, error`
 * - `makeEmailService()` returns an `IEmailService` instance
 */
describe('EmailService (PR #2 — IEmailService port + adapter)', () => {
  it('returns success with messageId when sendEmail resolves successfully', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<msg@mail.com>' });

    const svc = new EmailService();
    const result = await svc.sendWithAttachments({
      to: ['cliente@example.com'],
      subject: 'Resultados',
      html: '<p>Adjuntos</p>',
      attachments: [],
    });

    expect(result).toEqual({ success: true, messageId: '<msg@mail.com>' });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: ['cliente@example.com'],
      subject: 'Resultados',
      html: '<p>Adjuntos</p>',
      attachments: [],
    });
  });

  it('forwards cc to sendEmail when provided (THE PR #2 widening)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<cc@mail.com>' });

    const svc = new EmailService();
    await svc.sendWithAttachments({
      to: ['a@example.com'],
      cc: ['c@example.com', 'd@example.com'],
      subject: 'CC test',
      html: '<p>cc</p>',
      attachments: [],
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['c@example.com', 'd@example.com'] }),
    );
  });

  it('omits cc from sendEmail when not provided (no empty-array leak)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<no-cc@mail.com>' });

    const svc = new EmailService();
    await svc.sendWithAttachments({
      to: ['a@example.com'],
      subject: 'no cc',
      html: '<p>no cc</p>',
      attachments: [],
    });

    const params = mockSendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('cc');
  });

  it('forwards attachments as-is to sendEmail', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<att@mail.com>' });
    const att = { filename: 'doc.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' };

    const svc = new EmailService();
    await svc.sendWithAttachments({
      to: ['a@example.com'],
      subject: 'att',
      html: '<p>att</p>',
      attachments: [att],
    });

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ attachments: [att] }));
  });

  it('returns error when sendEmail resolves with success: false', async () => {
    mockSendEmail.mockResolvedValue({ success: false, code: 'SMTP_ERROR', error: 'Connection failed' });

    const svc = new EmailService();
    const result = await svc.sendWithAttachments({
      to: ['fail@example.com'],
      subject: 'fail',
      html: '<p>fail</p>',
      attachments: [],
    });

    expect(result).toEqual({ success: false, error: 'Connection failed' });
  });

  it('catches thrown errors and returns an error result', async () => {
    mockSendEmail.mockRejectedValue(new Error('Unexpected crash'));

    const svc = new EmailService();
    const result = await svc.sendWithAttachments({
      to: ['crash@example.com'],
      subject: 'crash',
      html: '<p>crash</p>',
      attachments: [],
    });

    expect(result).toEqual({ success: false, error: 'Unexpected crash' });
  });

  it('handles non-Error thrown values', async () => {
    mockSendEmail.mockRejectedValue('String error');

    const svc = new EmailService();
    const result = await svc.sendWithAttachments({
      to: ['str@example.com'],
      subject: 'str',
      html: '<p>str</p>',
      attachments: [],
    });

    expect(result).toEqual({ success: false, error: 'Unknown error' });
  });

  it('makeEmailService() returns an IEmailService instance', () => {
    const svc = makeEmailService();
    expect(typeof svc.sendWithAttachments).toBe('function');
    // Structural conformance: must satisfy the port.
    expect(svc).toBeInstanceOf(EmailService);
  });
});
