import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useConfigAgente } from '../useConfigAgente';

/**
 * Contract for useConfigAgente (agente-ia-crm E5·T6): GET/PUT
 * /api/crm/configuracion/agente plus the kill-switch endpoint.
 * Pinned: loading → populated | error, response-shape guard, save
 * success replaces state with the SERVER answer, 400 {campo} mapping,
 * network failure never throws, and the kill switch shows the
 * server's truth (no optimistic update; failure keeps the old state).
 */

const CONFIG = {
  habilitado: true,
  umbralConfianza: 0.6,
  maxIntercambios: 8,
  horarioDesde: 8,
  horarioHasta: 18,
  textoEscalado: 'Te paso con un asesor',
};
const FUENTES = {
  habilitado: 'default',
  umbralConfianza: 'db',
  maxIntercambios: 'env',
  horarioDesde: 'default',
  horarioHasta: 'default',
  textoEscalado: 'default',
};

const fetchMock = vi.fn();

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useConfigAgente — carga', () => {
  it('loading → populated con config y fuentes', async () => {
    fetchMock.mockResolvedValue(responder(200, { success: true, config: CONFIG, fuentes: FUENTES }));

    const { result } = renderHook(() => useConfigAgente());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('populated'));
    expect(result.current.config).toEqual(CONFIG);
    expect(result.current.fuentes?.umbralConfianza).toBe('db');
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/configuracion/agente');
  });

  it('HTTP 500 → status error con mensaje, sin tirar', async () => {
    fetchMock.mockResolvedValue(responder(500, { success: false, error: 'x', code: 'INTERNAL_ERROR' }));

    const { result } = renderHook(() => useConfigAgente());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.config).toBeNull();
  });

  it('error de red → status error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useConfigAgente());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/red/);
  });

  it('body con forma inesperada → status error (guard)', async () => {
    fetchMock.mockResolvedValue(
      responder(200, { success: true, config: { ...CONFIG, umbralConfianza: 'alto' }, fuentes: FUENTES }),
    );

    const { result } = renderHook(() => useConfigAgente());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.config).toBeNull();
  });
});

describe('useConfigAgente — guardar', () => {
  async function montarCargado() {
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, config: CONFIG, fuentes: FUENTES }));
    const hook = renderHook(() => useConfigAgente());
    await waitFor(() => expect(hook.result.current.status).toBe('populated'));
    return hook;
  }

  it('PUT con el subconjunto y reemplaza el estado con la respuesta del servidor', async () => {
    const { result } = await montarCargado();
    fetchMock.mockResolvedValueOnce(
      responder(200, {
        success: true,
        config: { ...CONFIG, umbralConfianza: 0.75 },
        fuentes: { ...FUENTES, umbralConfianza: 'db' },
      }),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.guardar({ umbralConfianza: 0.75 });
    });

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/crm/configuracion/agente');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ umbralConfianza: 0.75 });
    expect(result.current.config?.umbralConfianza).toBe(0.75);
    expect(result.current.errorGuardado).toBeNull();
  });

  it('400 {campo} se mapea a errorGuardado y conserva la config', async () => {
    const { result } = await montarCargado();
    fetchMock.mockResolvedValueOnce(
      responder(400, { success: false, error: 'umbralConfianza debe estar en (0, 1]', code: 'VALIDATION_ERROR', campo: 'umbralConfianza' }),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ umbralConfianza: 3 });
    });

    expect(ok).toBe(false);
    expect(result.current.errorGuardado).toEqual({
      mensaje: 'umbralConfianza debe estar en (0, 1]',
      campo: 'umbralConfianza',
      code: 'VALIDATION_ERROR',
    });
    expect(result.current.config).toEqual(CONFIG);

    act(() => result.current.limpiarErrorGuardado());
    expect(result.current.errorGuardado).toBeNull();
  });

  it('error de red al guardar → false con mensaje, sin tirar', async () => {
    const { result } = await montarCargado();
    fetchMock.mockRejectedValueOnce(new Error('boom'));

    let ok = true;
    await act(async () => {
      ok = await result.current.guardar({ maxIntercambios: 3 });
    });

    expect(ok).toBe(false);
    expect(result.current.errorGuardado?.mensaje).toMatch(/red/);
    expect(result.current.guardando).toBe(false);
  });
});

describe('useConfigAgente — kill switch', () => {
  async function montarCargado(habilitado: boolean) {
    fetchMock.mockResolvedValueOnce(
      responder(200, { success: true, config: { ...CONFIG, habilitado }, fuentes: FUENTES }),
    );
    const hook = renderHook(() => useConfigAgente());
    await waitFor(() => expect(hook.result.current.status).toBe('populated'));
    return hook;
  }

  it('muestra la verdad del servidor: PUT {habilitado} y adopta la respuesta', async () => {
    const { result } = await montarCargado(true);
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, habilitado: false }));

    await act(async () => {
      await result.current.alternarKillSwitch(false);
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/crm/configuracion/agente/kill-switch');
    expect(JSON.parse(init.body as string)).toEqual({ habilitado: false });
    expect(result.current.config?.habilitado).toBe(false);
  });

  it('NO es optimista: mientras el PUT está en vuelo el estado sigue siendo el anterior', async () => {
    const { result } = await montarCargado(true);
    let resolver: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolver = r)));

    let promesa: Promise<boolean> = Promise.resolve(false);
    act(() => {
      promesa = result.current.alternarKillSwitch(false);
    });

    expect(result.current.cambiandoKillSwitch).toBe(true);
    expect(result.current.config?.habilitado).toBe(true);

    await act(async () => {
      resolver(responder(200, { success: true, habilitado: false }));
      await promesa;
    });
    expect(result.current.config?.habilitado).toBe(false);
    expect(result.current.cambiandoKillSwitch).toBe(false);
  });

  it('si el servidor responde otra cosa que lo pedido, gana el servidor', async () => {
    const { result } = await montarCargado(true);
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, habilitado: true }));

    await act(async () => {
      await result.current.alternarKillSwitch(false);
    });

    expect(result.current.config?.habilitado).toBe(true);
  });

  it('fallo → errorKillSwitch y conserva el estado previo', async () => {
    const { result } = await montarCargado(true);
    fetchMock.mockResolvedValueOnce(responder(500, { success: false, error: 'x', code: 'INTERNAL_ERROR' }));

    let ok = true;
    await act(async () => {
      ok = await result.current.alternarKillSwitch(false);
    });

    expect(ok).toBe(false);
    expect(result.current.config?.habilitado).toBe(true);
    expect(result.current.errorKillSwitch).toBe('x');
  });

  it('body de éxito con forma inesperada se trata como fallo', async () => {
    const { result } = await montarCargado(true);
    fetchMock.mockResolvedValueOnce(responder(200, { success: true, habilitado: 'no' }));

    await act(async () => {
      await result.current.alternarKillSwitch(false);
    });

    expect(result.current.config?.habilitado).toBe(true);
    expect(result.current.errorKillSwitch).not.toBeNull();
  });
});
