import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConfigCanal } from '../useConfigCanal';

/**
 * Contract for useConfigCanal (agente-ia-crm E5·T6): Kapso channel
 * config. Pinned: secrets only as {configurado, mascara, ilegible},
 * a secret typed into a save is NEVER kept in hook state, the
 * regenerated webhook secret is exposed once and discarded on demand,
 * 503 CLAVE_NO_CONFIGURADA raises the blocking flag, and the probe.
 */

const SECRETO_TEXTO = 'sk-super-secreto-123';
const VISTA = {
  success: true,
  config: {
    modo: 'real',
    phoneNumberId: '1234567',
    timeoutMs: 15000,
    apiKey: { configurado: true, mascara: '••••9999' },
    webhookSecret: { configurado: false, mascara: '' },
  },
  fuentes: { modo: 'db', apiKey: 'db', phoneNumberId: 'env', webhookSecret: 'default', timeoutMs: 'default' },
};

const fetchMock = vi.fn();

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function montar(cuerpo: unknown = VISTA, status = 200) {
  fetchMock.mockResolvedValueOnce(responder(status, cuerpo));
  const hook = renderHook(() => useConfigCanal());
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'));
  return hook;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useConfigCanal — carga', () => {
  it('populated con config, fuentes y secretos solo como vista', async () => {
    const { result } = await montar();

    expect(result.current.status).toBe('populated');
    expect(result.current.config?.apiKey).toEqual({ configurado: true, mascara: '••••9999' });
    expect(result.current.fuentes?.phoneNumberId).toBe('env');
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/configuracion/canal');
  });

  it('guard: un secreto con forma inválida deja el hook en error', async () => {
    const { result } = await montar({ ...VISTA, config: { ...VISTA.config, apiKey: 'texto-plano' } });

    expect(result.current.status).toBe('error');
    expect(result.current.config).toBeNull();
  });

  it('HTTP 500 → error; red caída → error', async () => {
    const a = await montar({ success: false, error: 'x', code: 'INTERNAL_ERROR' }, 500);
    expect(a.result.current.status).toBe('error');

    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const b = renderHook(() => useConfigCanal());
    await waitFor(() => expect(b.result.current.status).toBe('error'));
  });
});

describe('useConfigCanal — guardar', () => {
  it('envía el subconjunto (incl. null para quitar) y adopta la vista del servidor', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(200, { ...VISTA, config: { ...VISTA.config, apiKey: { configurado: false, mascara: '' } } }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.guardar({ apiKey: null });
    });

    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: null });
    expect(result.current.config?.apiKey.configurado).toBe(false);
  });

  it('un secreto enviado jamás queda en el estado del hook', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(responder(200, VISTA));

    await act(async () => {
      await result.current.guardar({ apiKey: SECRETO_TEXTO });
    });

    expect(JSON.stringify(result.current)).not.toContain(SECRETO_TEXTO);
  });

  it('un guardado fallido tampoco retiene el secreto y expone {campo}', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(400, { success: false, error: 'apiKey no puede estar en blanco', code: 'VALIDATION_ERROR', campo: 'apiKey' }),
    );

    await act(async () => {
      await result.current.guardar({ apiKey: SECRETO_TEXTO });
    });

    expect(result.current.errorGuardado?.campo).toBe('apiKey');
    expect(JSON.stringify(result.current)).not.toContain(SECRETO_TEXTO);
  });

  it('503 CLAVE_NO_CONFIGURADA levanta el bloqueo de secretos', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(503, { success: false, error: 'No se pueden guardar secretos', code: 'CLAVE_NO_CONFIGURADA' }),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ apiKey: SECRETO_TEXTO });
    });

    expect(ok).toBe(false);
    expect(result.current.claveNoConfigurada).toBe(true);
    expect(JSON.stringify(result.current)).not.toContain(SECRETO_TEXTO);
  });
});

describe('useConfigCanal — regenerar secret del webhook', () => {
  it('expone el secreto generado una vez y lo descarta al cerrar', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(200, {
        ...VISTA,
        config: { ...VISTA.config, webhookSecret: { configurado: true, mascara: '••••abcd' } },
        webhookSecretGenerado: 'whsec_generado_unico',
      }),
    );

    await act(async () => {
      await result.current.regenerarWebhookSecret();
    });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ accion: 'regenerarWebhookSecret' });
    expect(result.current.webhookSecretGenerado).toBe('whsec_generado_unico');
    expect(result.current.config?.webhookSecret.configurado).toBe(true);

    act(() => result.current.descartarWebhookSecret());
    expect(result.current.webhookSecretGenerado).toBeNull();
    expect(JSON.stringify(result.current)).not.toContain('whsec_generado_unico');
  });

  it('un guardado posterior descarta el secreto generado', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(responder(200, { ...VISTA, webhookSecretGenerado: 'whsec_x' }));
    await act(async () => {
      await result.current.regenerarWebhookSecret();
    });
    fetchMock.mockResolvedValueOnce(responder(200, VISTA));
    await act(async () => {
      await result.current.guardar({ timeoutMs: 20000 });
    });

    expect(result.current.webhookSecretGenerado).toBeNull();
  });

  it('503 CLAVE_NO_CONFIGURADA al regenerar → bloqueo y sin secreto', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(responder(503, { success: false, error: 'x', code: 'CLAVE_NO_CONFIGURADA' }));

    await act(async () => {
      await result.current.regenerarWebhookSecret();
    });

    expect(result.current.claveNoConfigurada).toBe(true);
    expect(result.current.webhookSecretGenerado).toBeNull();
  });
});

describe('useConfigCanal — probar', () => {
  it('POST /probar → resultadoProbe {ok, detalle} y estado probando', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, ok: true, detalle: 'Conexión correcta' }));

    await act(async () => {
      await result.current.probar();
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/crm/configuracion/canal/probar');
    expect(init.method).toBe('POST');
    expect(result.current.resultadoProbe).toEqual({ ok: true, detalle: 'Conexión correcta' });
    expect(result.current.probando).toBe(false);
  });

  it('fallo de red → resultadoProbe ok=false, sin tirar', async () => {
    const { result } = await montar();
    fetchMock.mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      await result.current.probar();
    });

    expect(result.current.resultadoProbe?.ok).toBe(false);
  });
});
