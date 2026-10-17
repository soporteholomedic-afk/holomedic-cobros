import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConfigMemoria } from '../useConfigMemoria';

/**
 * Contract for useConfigMemoria (agente-ia-crm E5·T6): Engram memory
 * config. Same secret rules as the canal hook (token only as a view,
 * never retained after a save).
 */

const SECRETO_TEXTO = 'tok-super-secreto-456';
const VISTA = {
  success: true,
  config: {
    url: 'http://engram.local',
    timeoutMs: 5000,
    retencionMeses: 12,
    token: { configurado: true, mascara: '••••1234' },
  },
  fuentes: { url: 'db', token: 'db', timeoutMs: 'default', retencionMeses: 'default' },
};

const fetchMock = vi.fn();

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function montar(cuerpo: unknown = VISTA, status = 200) {
  fetchMock.mockResolvedValueOnce(responder(status, cuerpo));
  const hook = renderHook(() => useConfigMemoria());
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

describe('useConfigMemoria', () => {
  it('carga: populated con url, retención y token solo como vista', async () => {
    const { result } = await montar();

    expect(result.current.status).toBe('populated');
    expect(result.current.config?.url).toBe('http://engram.local');
    expect(result.current.config?.token.mascara).toBe('••••1234');
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/configuracion/memoria');
  });

  it('guard de forma y HTTP 500 → error', async () => {
    const a = await montar({ ...VISTA, config: { ...VISTA.config, retencionMeses: '12' } });
    expect(a.result.current.status).toBe('error');

    const b = await montar({ success: false, error: 'x', code: 'INTERNAL_ERROR' }, 500);
    expect(b.result.current.status).toBe('error');
  });

  it('guardar adopta la vista del servidor y nunca retiene el token enviado', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(200, { ...VISTA, config: { ...VISTA.config, retencionMeses: 24 } }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.guardar({ retencionMeses: 24, token: SECRETO_TEXTO });
    });

    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ retencionMeses: 24, token: SECRETO_TEXTO });
    expect(result.current.config?.retencionMeses).toBe(24);
    expect(JSON.stringify(result.current)).not.toContain(SECRETO_TEXTO);
  });

  it('400 {campo} se mapea; 503 CLAVE_NO_CONFIGURADA levanta el bloqueo', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(
      responder(400, { success: false, error: 'retencionMeses fuera de rango', code: 'VALIDATION_ERROR', campo: 'retencionMeses' }),
    );
    await act(async () => {
      await result.current.guardar({ retencionMeses: 999 });
    });
    expect(result.current.errorGuardado?.campo).toBe('retencionMeses');

    fetchMock.mockResolvedValueOnce(responder(503, { success: false, error: 'x', code: 'CLAVE_NO_CONFIGURADA' }));
    await act(async () => {
      await result.current.guardar({ token: SECRETO_TEXTO });
    });
    expect(result.current.claveNoConfigurada).toBe(true);
    expect(JSON.stringify(result.current)).not.toContain(SECRETO_TEXTO);
  });

  it('probar → resultadoProbe; fallo de red → ok=false', async () => {
    const { result } = await montar();
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, ok: false, detalle: 'Sin respuesta' }));
    await act(async () => {
      await result.current.probar();
    });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/crm/configuracion/memoria/probar');
    expect(result.current.resultadoProbe).toEqual({ ok: false, detalle: 'Sin respuesta' });

    fetchMock.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.probar();
    });
    expect(result.current.resultadoProbe?.ok).toBe(false);
  });
});
