import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Transport stub — NO live SMTP. Mirrors src/utils/__tests__/sendEmail.test.ts:
// the adapter is tested through the port with nodemailer mocked at the module
// boundary. The logo seam is untouched (no template body references the cid).
const mockSendMail = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

import { __resetTransport } from '@/utils/sendEmail';

import { EnviadorCorreoCrm } from '../enviadorCorreoCrm';
import type { EnvioCrmCorreo } from '../../../domain/ports';

const DATOS: EnvioCrmCorreo = {
  destinatario: 'rrhh@acme.com',
  plantilla: 'carta_presentacion',
  empresa: 'Acme SA',
  contacto: 'Ana Pérez',
  sector: 'Construcción',
  trabajadores: 45,
};

function mailEnviado(): Record<string, unknown> {
  return mockSendMail.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('EnviadorCorreoCrm (puerto EnviadorCorreoCrmPort — tarea 4.1)', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    __resetTransport();
    process.env.SMTP_HOST = 'smtp.office365.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER_CRM = 'crm@holomedic.com';
    process.env.SMTP_PASS_CRM = 'crm-secret';
  });

  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER_CRM;
    delete process.env.SMTP_PASS_CRM;
    delete process.env.SMTP_USER_FACTURACION;
    delete process.env.SMTP_PASS_FACTURACION;
  });

  it('ok:true con el messageId del transporte y envía al destinatario del contacto', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<carta-1@holomedic.com>' });

    const resultado = await new EnviadorCorreoCrm().enviar(DATOS);

    expect(resultado).toEqual({ ok: true, messageId: '<carta-1@holomedic.com>' });
    expect(mailEnviado().to).toEqual(['rrhh@acme.com']);
  });

  it('renderiza la plantilla verbatim: asunto con [Empresa] resuelto y cuerpo interpolado', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r@x>' });

    await new EnviadorCorreoCrm().enviar(DATOS);

    const mail = mailEnviado();
    expect(mail.subject).toBe(
      'Presentación: Chequeos médicos y salud para los trabajadores de Acme SA',
    );
    expect(mail.html).toContain('<strong>Ana Pérez</strong>');
    expect(mail.html).not.toContain('[Empresa]');
    expect(mail.html).not.toContain('{{empresa}}');
    expect(mail.html).not.toContain('{{trabajadores}}');
  });

  it('despacha con el remitente dedicado purpose "crm" (from = SMTP_USER_CRM)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r@x>' });

    await new EnviadorCorreoCrm().enviar(DATOS);

    expect(mailEnviado().from).toBe('crm@holomedic.com');
  });

  it('v1 sin adjuntos: la carta sale SIN attachments (EM-3)', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<r@x>' });

    await new EnviadorCorreoCrm().enviar(DATOS);

    expect(mailEnviado()).not.toHaveProperty('attachments');
  });

  it.each([
    ['SMTP_AUTH_ERROR', new Error('Invalid login: 535 Authentication failed')],
    ['SMTP_TIMEOUT', Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' })],
    ['SMTP_ERROR', new Error('Connection refused')],
  ])('surfaced verbatim: %s', async (codigo, error) => {
    mockSendMail.mockRejectedValue(error);

    const resultado = await new EnviadorCorreoCrm().enviar(DATOS);

    expect(resultado).toEqual({
      ok: false,
      error: codigo,
      detalle: expect.stringMatching(/failed|timed out|refused/i) as unknown as string,
    });
  });

  it('sin credenciales CRM falla tipado y SIN cruzarse a otro purpose (EM-2)', async () => {
    delete process.env.SMTP_USER_CRM;
    delete process.env.SMTP_PASS_CRM;
    process.env.SMTP_USER_FACTURACION = 'facturacion@example.com';
    process.env.SMTP_PASS_FACTURACION = 'facturacion-secret';
    mockSendMail.mockResolvedValue({ messageId: '<nunca@x>' });

    const resultado = await new EnviadorCorreoCrm().enviar(DATOS);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe('SMTP_ERROR');
      expect(resultado.detalle).toContain('SMTP_USER_CRM');
      expect(resultado.detalle).not.toContain('FACTURACION');
    }
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
