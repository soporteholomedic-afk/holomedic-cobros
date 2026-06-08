import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock sendEmail ----

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// ---- Import after mocks ----

import { sendWithAttachments } from '../emailService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendWithAttachments', () => {
  it('should call sendEmail with attachments and return success', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<msg@mail.com>' });

    const result = await sendWithAttachments(
      ['cliente@example.com'],
      'Test subject',
      '<p>Body</p>',
      [{ filename: 'doc.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
    );

    expect(result).toEqual({ success: true, messageId: '<msg@mail.com>' });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: ['cliente@example.com'],
      subject: 'Test subject',
      html: '<p>Body</p>',
      attachments: [{ filename: 'doc.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
    });
  });

  it('should call sendEmail without attachments and return success (backward compat)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<msg2@mail.com>' });

    const result = await sendWithAttachments(
      ['user@test.com'],
      'No files',
      '<p>No attachments</p>',
      [],
    );

    expect(result).toEqual({ success: true, messageId: '<msg2@mail.com>' });
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: ['user@test.com'],
      subject: 'No files',
      html: '<p>No attachments</p>',
      attachments: [],
    });
  });

  it('should return error when sendEmail fails', async () => {
    mockSendEmail.mockResolvedValue({ success: false, code: 'SMTP_ERROR', error: 'Connection failed' });

    const result = await sendWithAttachments(
      ['fail@test.com'],
      'Fail',
      '<p>Fail</p>',
      [],
    );

    expect(result).toEqual({ success: false, error: 'Connection failed' });
  });

  it('should catch thrown errors and return error result', async () => {
    mockSendEmail.mockRejectedValue(new Error('Unexpected crash'));

    const result = await sendWithAttachments(
      ['crash@test.com'],
      'Crash',
      '<p>Crash</p>',
      [],
    );

    expect(result).toEqual({ success: false, error: 'Unexpected crash' });
  });

  it('should handle non-Error thrown values', async () => {
    mockSendEmail.mockRejectedValue('String error');

    const result = await sendWithAttachments(
      ['str@test.com'],
      'Str',
      '<p>Str</p>',
      [],
    );

    expect(result).toEqual({ success: false, error: 'Unknown error' });
  });
});
