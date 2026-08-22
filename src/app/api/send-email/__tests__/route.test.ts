import { afterEach, beforeEach, describe, it, expect, vi, type Mock } from 'vitest';

import type {
  ICobranzaEnviosHistorialRepository,
} from '@/features/cobranza/domain/ports';
import type { RegistroEnvioCobranzaInput } from '@/features/cobranza/domain/entities';
import { __setCobranzaHistorialForTests } from '@/features/cobranza/infrastructure/getCobranzaHistorialDb';

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// REQ-02: the audit context resolves enviadoPor from the session
// nombre; getSession reads next/headers cookies which do not exist
// in the unit-test runtime (contactos route test precedent).
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

import { POST } from '../route';

// ---- Cobranza audit mock plumbing ----

function makeMockRepo(
  repo: Partial<ICobranzaEnviosHistorialRepository> = {},
): ICobranzaEnviosHistorialRepository {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getByRuc: vi.fn().mockResolvedValue([]),
    ...repo,
  };
}

let mockInsert: Mock<(input: RegistroEnvioCobranzaInput) => Promise<void>>;

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockReset();
  mockGetSession.mockReset().mockResolvedValue({ nombre: 'Dra. House', permisos: ['cobranza'] });
  mockInsert = vi.fn().mockResolvedValue(undefined);
  __setCobranzaHistorialForTests(makeMockRepo({ insert: mockInsert }));
});

afterEach(() => {
  __setCobranzaHistorialForTests(null);
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

  // ---- Purpose whitelist (REQ-01 DIR-08, T1b.8) ----

  it('defaults purpose to facturacion when absent (back-compat regression, DIR-08)', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<nopurpose@outlook.com>',
    });

    // Shape used today by every current consumer (modal, valoraciones).
    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Estado de cuenta',
      html: '<p>Test</p>',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'facturacion' }),
    );
  });

  it('passes purpose cobranza through to sendEmail (DIR-07/DIR-08, REQ-02 ruc present)', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<cob@outlook.com>',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Cobranza',
      html: '<p>Test</p>',
      purpose: 'cobranza',
      ruc: '20123456789',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'cobranza' }),
    );
  });

  it('passes purpose consolidados through to sendEmail', async () => {
    mockSendEmail.mockResolvedValue({
      success: true,
      messageId: '<cons@outlook.com>',
    });

    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Consolidado',
      html: '<p>Test</p>',
      purpose: 'consolidados',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'consolidados' }),
    );
  });

  it('returns 400 VALIDATION_ERROR for an unknown purpose value (DIR-08)', async () => {
    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      purpose: 'spam',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('purpose');
    // Rejected before dispatch — sendEmail is never called.
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rejects a non-string purpose value with 400 (type safety on the whitelist)', async () => {
    const request = makeRequest({
      to: ['cliente@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      purpose: 123,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ---- Cobranza audit integration (REQ-02, tasks 4.3/4.4) ----

function makeCobranzaBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    to: ['cobranza@empresa.com'],
    cc: ['gerencia@empresa.com'],
    subject: 'Estado de cuenta — requerimiento',
    html: '<p>Requerimiento de pago</p>',
    purpose: 'cobranza',
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    montoReclamado: 1500.5,
    moneda: 'S/',
    comprobantesCount: 3,
    ...overrides,
  };
}

function sentInput(): RegistroEnvioCobranzaInput {
  return mockInsert.mock.calls[0]?.[0] as RegistroEnvioCobranzaInput;
}

describe('POST /api/send-email — cobranza audit registration (REQ-02)', () => {
  it('audits a successful send: exactly one insert, SUCCESS, session user, full HTML body', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    const response = await POST(makeRequest(makeCobranzaBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(sentInput()).toEqual({
      ruc: '20123456789',
      razonSocial: 'EMPRESA SAC',
      destinatarios: ['cobranza@empresa.com'],
      copias: ['gerencia@empresa.com'],
      asunto: 'Estado de cuenta — requerimiento',
      cuerpoResumen: '<p>Requerimiento de pago</p>',
      montoReclamado: 1500.5,
      moneda: 'S/',
      comprobantesCount: 3,
      estadoEnvio: 'SUCCESS',
      errorDetalle: null,
      enviadoPor: 'Dra. House',
    } satisfies RegistroEnvioCobranzaInput);
    expect(body.success).toBe(true);
  });

  it('audits an SMTP/network failure: FAILED row carrying the transport error', async () => {
    mockSendEmail.mockResolvedValue({
      success: false,
      code: 'SMTP_TIMEOUT',
      error: 'SMTP connection timed out',
    });

    const response = await POST(makeRequest(makeCobranzaBody()));
    const body = await response.json();

    // The operator-visible outcome is unchanged (503 SMTP_TIMEOUT).
    expect(response.status).toBe(503);
    expect(body.code).toBe('SMTP_TIMEOUT');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(sentInput()).toMatchObject({
      estadoEnvio: 'FAILED',
      errorDetalle: 'SMTP connection timed out',
      enviadoPor: 'Dra. House',
    });
  });

  it('audits an unexpected exception: FAILED row from the outer catch (R1.3)', async () => {
    mockSendEmail.mockRejectedValue(new Error('Something unexpected'));

    const response = await POST(makeRequest(makeCobranzaBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(sentInput()).toMatchObject({
      estadoEnvio: 'FAILED',
      errorDetalle: 'Something unexpected',
    });
  });

  it('audit outage leaves the send response unchanged (D2 best-effort, R1.4)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInsert.mockRejectedValue(new Error('audit DB unreachable'));

    try {
      const response = await POST(makeRequest(makeCobranzaBody()));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, messageId: '<ok@outlook.com>' });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('falls back to enviadoPor "sistema" when the session is absent (R1.5)', async () => {
    mockGetSession.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    await POST(makeRequest(makeCobranzaBody()));

    expect(sentInput()).toMatchObject({ enviadoPor: 'sistema' });
  });

  it('falls back to enviadoPor "sistema" for a whitespace-only session nombre (R1.5)', async () => {
    mockGetSession.mockResolvedValue({ nombre: '   ', permisos: ['cobranza'] });
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    await POST(makeRequest(makeCobranzaBody()));

    expect(sentInput()).toMatchObject({ enviadoPor: 'sistema' });
  });

  it('does NOT audit non-cobranza purposes (R2.1)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<fb@outlook.com>' });

    const response = await POST(
      makeRequest(makeCobranzaBody({ purpose: 'facturacion' })),
    );

    expect(response.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('audits a junk key (non-digit, ≤11 chars) trimmed and as-is (R6.2)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    const response = await POST(makeRequest(makeCobranzaBody({ ruc: ' SINKEY123 ' })));

    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(sentInput()).toMatchObject({ ruc: 'SINKEY123' });
  });

  it('accepts an over-length junk key without blocking the send (documented residual risk)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    const response = await POST(
      makeRequest(makeCobranzaBody({ ruc: 'CLIENTE-CON-RUC-MUY-LARGO-9999' })),
    );

    // Never block the send; the INSERT will fail server-side and the
    // audit helper swallows it per D2.
    expect(response.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(sentInput()).toMatchObject({ ruc: 'CLIENTE-CON-RUC-MUY-LARGO-9999' });
  });

  it('stores null optional metadata when the payload omits it (back-compat)', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    const { razonSocial: _r, montoReclamado: _m, moneda: _mo, comprobantesCount: _c, ...minimal } =
      makeCobranzaBody();
    void _r; void _m; void _mo; void _c;

    const response = await POST(makeRequest(minimal));

    expect(response.status).toBe(200);
    expect(sentInput()).toMatchObject({
      razonSocial: null,
      montoReclamado: null,
      moneda: null,
      comprobantesCount: null,
    });
  });

  it('accepts boundary metadata values (0 amount, 0 count) and trims razonSocial', async () => {
    mockSendEmail.mockResolvedValue({ success: true, messageId: '<ok@outlook.com>' });

    const response = await POST(
      makeRequest(
        makeCobranzaBody({
          montoReclamado: 0,
          comprobantesCount: 0,
          razonSocial: '  EMPRESA SAC  ',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(sentInput()).toMatchObject({
      montoReclamado: 0,
      comprobantesCount: 0,
      razonSocial: 'EMPRESA SAC',
    });
  });

  it.each([
    ['missing ruc', (b: Record<string, unknown>) => ({ ...b, ruc: undefined })],
    ['empty ruc', (b: Record<string, unknown>) => ({ ...b, ruc: '   ' })],
    ['non-string ruc', (b: Record<string, unknown>) => ({ ...b, ruc: 20123456789 })],
    ['non-string comprobantesCount', (b: Record<string, unknown>) => ({ ...b, comprobantesCount: 'abc' })],
    ['negative comprobantesCount', (b: Record<string, unknown>) => ({ ...b, comprobantesCount: -1 })],
    ['non-integer comprobantesCount', (b: Record<string, unknown>) => ({ ...b, comprobantesCount: 1.5 })],
    ['non-number montoReclamado', (b: Record<string, unknown>) => ({ ...b, montoReclamado: '1500' })],
    ['negative montoReclamado', (b: Record<string, unknown>) => ({ ...b, montoReclamado: -0.01 })],
    ['non-string moneda', (b: Record<string, unknown>) => ({ ...b, moneda: 42 })],
    ['over-length moneda', (b: Record<string, unknown>) => ({ ...b, moneda: 'MONEDA-LARGA' })],
    ['non-string razonSocial', (b: Record<string, unknown>) => ({ ...b, razonSocial: 42 })],
  ])('returns 400 VALIDATION_ERROR for %s — no send, no audit row (R6.3)', async (_label, mutate) => {
    const response = await POST(makeRequest(mutate(makeCobranzaBody())));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects an over-precision montoReclamado beyond DECIMAL(18,2) bounds (R6.3)', async () => {
    const response = await POST(
      makeRequest(makeCobranzaBody({ montoReclamado: 1e17 })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
