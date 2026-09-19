import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildTransicionesPath, useTransicion } from '../useTransicion';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildTransicionesPath', () => {
  it('builds the transitions API path for the empresa id', () => {
    expect(buildTransicionesPath(42)).toBe('/api/crm/empresas/42/transiciones');
  });
});

describe('useTransicion', () => {
  it('POSTs the payload to the transitions endpoint and resolves ok on 200', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, estado: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' } }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useTransicion(42));
    let resultado: { ok: boolean; error: string | null } | undefined;

    await act(async () => {
      resultado = await result.current.ejecutar({ evento: 'CotizaciónEnviada' });
    });

    expect(resultado).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas/42/transiciones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ evento: 'CotizaciónEnviada' }),
    });
    expect(result.current.enCurso).toBe(false);
  });

  it('surfaces the API Spanish error verbatim on 400 (illegal move / missing motivo)', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Transición no válida: el evento "Reactivar" no aplica desde INBOUND/SEGUIMIENTO',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 },
      ),
    );

    const { result } = renderHook(() => useTransicion(42));
    let resultado: { ok: boolean; error: string | null } | undefined;

    await act(async () => {
      resultado = await result.current.ejecutar({ evento: 'Reactivar' });
    });

    expect(resultado).toEqual({
      ok: false,
      error: 'Transición no válida: el evento "Reactivar" no aplica desde INBOUND/SEGUIMIENTO',
    });
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const { result } = renderHook(() => useTransicion(42));
    let resultado: { ok: boolean; error: string | null } | undefined;

    await act(async () => {
      resultado = await result.current.ejecutar({ evento: 'Rechazo', motivo: 'Ya tiene proveedor' });
    });

    expect(resultado).toEqual({ ok: false, error: 'Error de red' });
  });

  it('toggles enCurso while the request is in flight', async () => {
    let resolverFetch: ((r: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolverFetch = resolve;
        }),
    );

    const { result } = renderHook(() => useTransicion(42));

    let pendiente: Promise<{ ok: boolean; error: string | null }>;
    act(() => {
      pendiente = result.current.ejecutar({ evento: 'CotizaciónEnviada' });
    });
    await waitFor(() => expect(result.current.enCurso).toBe(true));

    await act(async () => {
      resolverFetch?.(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
        }),
      );
      await pendiente;
    });
    expect(result.current.enCurso).toBe(false);
  });
});
