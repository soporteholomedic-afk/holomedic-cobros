import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

import { POST } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockReset();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/send-email', () => {
  it('should return 200 with success when sendEmail succeeds', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<abc123@outlook.com>',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Estado de cuenta',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      messageId: '<abc123@outlook.com>',
    });
  });

  it('should return 400 when "to" field is missing', async () => {
    const request = makeRequest({
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('recipient');
  });

  it('should return 400 when "to" is an empty array', async () => {
    const request = makeRequest({
      to: [],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('recipient');
  });

  it('should return 400 when "subject" field is missing', async () => {
    const request = makeRequest({
      to: ['cliente@example.com'],
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('subject');
  });

  it('should return 400 when "html" field is missing', async () => {
    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('html');
  });

  it('should return 400 for invalid JSON body', async () => {
    const request = new Request('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('JSON');
  });

  it('should return 400 for invalid email address', async () => {
    const request = makeRequest({
      to: ['not-an-email'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('email');
  });

  it('should return 413 for body larger than 1MB', async () => {
    // Build a payload that exceeds 1MB
    const largeHtml = '<p>' + 'x'.repeat(1_050_000) + '</p>';
    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: largeHtml,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('large');
  });

  it('should return 500 when sendEmail returns SMTP_ERROR (e.g. missing env vars)', async () => {
    mockSendEmail.mockResolvedValue({
      success: false,
      code: 'SMTP_ERROR',
      error: 'SMTP not configured: missing SMTP_HOST',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SMTP_ERROR');
    expect(body.error).toContain('SMTP');
  });

  it('should return 500 with SMTP_AUTH_ERROR on auth failure', async () => {
    mockSendEmail.mockResolvedValue({
      success: false,
      code: 'SMTP_AUTH_ERROR',
      error: 'SMTP authentication failed',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SMTP_AUTH_ERROR');
    expect(body.error).toContain('authentication');
  });

  it('should return 503 on SMTP timeout', async () => {
    mockSendEmail.mockResolvedValue({
      success: false,
      code: 'SMTP_TIMEOUT',
      error: 'SMTP connection timed out',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.code).toBe('SMTP_TIMEOUT');
  });

  it('should pass the correct parameters to sendEmail', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<abc@outlook.com>',
    });

    const request = makeRequest({
      to: ['test@domain.com'],
      subject: 'Hello',
      html: '<h1>World</h1>',
    });

    await POST(request);

    expect(mockSendEmail).toHaveBeenCalledWith({
      to: ['test@domain.com'],
      subject: 'Hello',
      html: '<h1>World</h1>',
      purpose: 'facturacion',
    });
  });

  it('should not expose SMTP credentials in the response', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<abc@outlook.com>',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const bodyText = JSON.stringify(await response.json());

    expect(bodyText).not.toContain('SMTP_HOST');
    expect(bodyText).not.toContain('SMTP_USER');
    expect(bodyText).not.toContain('SMTP_PASS');
  });

  it('should return 500 with INTERNAL_ERROR for unexpected errors in sendEmail', async () => {
    mockSendEmail.mockRejectedValue(new Error('Something unexpected'));

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('should return 400 when body is a valid JSON array (not an object)', async () => {
    const request = new Request('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(['to@example.com', 'Test', '<p>Test</p>']),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 200 when body contains extra unknown fields', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<extra@outlook.com>',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      extraField: 'should be ignored',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it('should return 200 with multiple To recipients', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<multi@outlook.com>',
    });

    const request = makeRequest({
      to: ['a@b.com', 'c@d.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should return 200 with To + CC recipients', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<cc@outlook.com>',
    });

    const request = makeRequest({
      to: ['primary@b.com'],
      cc: ['cc@b.com'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['primary@b.com'],
        cc: ['cc@b.com'],
      })
    );
  });

  it('should return 400 when CC contains an invalid email', async () => {
    const request = makeRequest({
      to: ['good@b.com'],
      cc: ['invalid'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('CC');
  });

  it('should return 400 when total recipients exceed 10', async () => {
    const request = makeRequest({
      to: Array.from({ length: 11 }, (_, i) => `user${i}@b.com`),
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('10');
  });

  it('should return 400 for email without TLD', async () => {
    const request = makeRequest({
      to: ['user@localhost'],
      subject: 'Test',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
