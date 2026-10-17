import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Adapter contract for EnviadorKapsoWhatsapp (agente-ia-crm E1,
 * remediation R3-kapso-adapter-sin-cobertura): the SDK is mocked at
 * the module boundary (AGENTS.md testing rule) so every pinned
 * outcome is exercised WITHOUT network:
 * - happy path → {ok:true, wamid} with phoneNumberId/to/body from the env
 * - GraphApiError 401/403 (real SDK error shape: httpStatus field) →
 *   KAPSO_AUTH_ERROR
 * - hung SDK call → KAPSO_TIMEOUT after KAPSO_TIMEOUT_MS (the race
 *   owns the deadline; SDK v0.3.0 has no signal/timeout option)
 * - generic error / response without wamid → KAPSO_ERROR
 * - missing KAPSO_API_KEY or KAPSO_PHONE_NUMBER_ID →
 *   KAPSO_NO_CONFIGURADO without instantiating the client
 */

const mocks = vi.hoisted(() => {
  /** Fake of the SDK's GraphApiError (httpStatus is the field the adapter reads). */
  class GraphApiErrorFake extends Error {
    readonly httpStatus: number;

    constructor(message: string, httpStatus: number) {
      super(message);
      this.name = 'GraphApiError';
      this.httpStatus = httpStatus;
    }
  }
  const sendTextMock = vi.fn();
  /** Constructor args of every WhatsAppClient instantiation (to pin the config). */
  const configsCapturados: unknown[] = [];
  class WhatsAppClientFake {
    readonly messages = { sendText: sendTextMock };

    constructor(config: unknown) {
      configsCapturados.push(config);
    }
  }
  return { GraphApiErrorFake, sendTextMock, WhatsAppClientFake, configsCapturados };
});

vi.mock('@kapso/whatsapp-cloud-api', () => ({
  WhatsAppClient: mocks.WhatsAppClientFake,
  GraphApiError: mocks.GraphApiErrorFake,
}));

import { EnviadorKapsoWhatsapp } from '../enviadorKapsoWhatsapp';

const ENVIO = { telefonoE164: '+595981234567', cuerpo: 'Hola, te escribimos de Holomedic' };

beforeEach(() => {
  vi.stubEnv('KAPSO_API_KEY', 'kapso-key-test');
  vi.stubEnv('KAPSO_PHONE_NUMBER_ID', 'pnid-123');
  // Timeout corto de test: el race debe vencer rápido al hang del SDK.
  vi.stubEnv('KAPSO_TIMEOUT_MS', '40');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.configsCapturados.length = 0;
});

describe('EnviadorKapsoWhatsapp — adapter Kapso (E1)', () => {
  it('happy path → {ok:true, wamid} llamando al SDK con phoneNumberId/to/body', async () => {
    mocks.sendTextMock.mockResolvedValueOnce({ messages: [{ id: 'wamid.HB.LCM.774' }] });

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toEqual({ ok: true, wamid: 'wamid.HB.LCM.774' });
    expect(mocks.configsCapturados).toEqual([
      { kapsoApiKey: 'kapso-key-test', baseUrl: 'https://api.kapso.ai/meta/whatsapp' },
    ]);
    expect(mocks.sendTextMock).toHaveBeenCalledWith({
      phoneNumberId: 'pnid-123',
      to: '+595981234567',
      body: ENVIO.cuerpo,
    });
  });

  it.each([401, 403])('GraphApiError HTTP %i → KAPSO_AUTH_ERROR', async (httpStatus) => {
    mocks.sendTextMock.mockRejectedValueOnce(
      new mocks.GraphApiErrorFake('(#190) Invalid OAuth access token', httpStatus),
    );

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_AUTH_ERROR' });
  });

  it('hang del SDK → KAPSO_TIMEOUT tras KAPSO_TIMEOUT_MS (race propio, sin señal del SDK)', async () => {
    mocks.sendTextMock.mockImplementationOnce(() => new Promise<never>(() => {}));

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_TIMEOUT' });
  }, 2000);

  it('error genérico → KAPSO_ERROR (sin exponer el cuerpo)', async () => {
    mocks.sendTextMock.mockRejectedValueOnce(new Error('fetch failed: network down'));

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({
      ok: false,
      error: 'KAPSO_ERROR',
      detalle: 'fetch failed: network down',
    });
  });

  it('respuesta sin wamid → KAPSO_ERROR', async () => {
    mocks.sendTextMock.mockResolvedValueOnce({ messages: [] });

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_ERROR' });
  });

  it('sin KAPSO_API_KEY → KAPSO_NO_CONFIGURADO sin instanciar el client', async () => {
    vi.stubEnv('KAPSO_API_KEY', '');

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });
    expect(mocks.configsCapturados).toHaveLength(0);
  });

  it('sin KAPSO_PHONE_NUMBER_ID → KAPSO_NO_CONFIGURADO', async () => {
    vi.stubEnv('KAPSO_PHONE_NUMBER_ID', '');

    const resultado = await new EnviadorKapsoWhatsapp().enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });
  });
});

describe('EnviadorKapsoWhatsapp — config inyectada (E5·T5b)', () => {
  it('usa apiKey/phoneNumberId inyectados en vez del entorno', async () => {
    mocks.sendTextMock.mockResolvedValueOnce({ messages: [{ id: 'wamid.inj' }] });

    const resultado = await new EnviadorKapsoWhatsapp({
      apiKey: 'db-key',
      phoneNumberId: 'db-pnid',
      timeoutMs: 1000,
    }).enviar(ENVIO);

    expect(resultado).toEqual({ ok: true, wamid: 'wamid.inj' });
    expect(mocks.configsCapturados).toEqual([
      { kapsoApiKey: 'db-key', baseUrl: 'https://api.kapso.ai/meta/whatsapp' },
    ]);
    expect(mocks.sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumberId: 'db-pnid' }),
    );
  });

  it('usa el timeout inyectado (el entorno de 40 ms no aplica)', async () => {
    mocks.sendTextMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ messages: [{ id: 'w' }] }), 120)),
    );

    const resultado = await new EnviadorKapsoWhatsapp({
      apiKey: 'k',
      phoneNumberId: 'p',
      timeoutMs: 2000,
    }).enviar(ENVIO);

    expect(resultado).toEqual({ ok: true, wamid: 'w' });
  });

  it('config inyectada sin apiKey → KAPSO_NO_CONFIGURADO aunque el entorno la tenga', async () => {
    const resultado = await new EnviadorKapsoWhatsapp({
      apiKey: null,
      phoneNumberId: 'p',
      timeoutMs: 1000,
    }).enviar(ENVIO);

    expect(resultado).toMatchObject({ ok: false, error: 'KAPSO_NO_CONFIGURADO' });
    expect(mocks.configsCapturados).toHaveLength(0);
  });
});
