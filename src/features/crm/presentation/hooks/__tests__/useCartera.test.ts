import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildCarteraPath, useCartera } from '../useCartera';
import type { FilaCartera } from '../../../application/listarCartera';

/**
 * Hook contract for the cartera list (tasks pr15/WU2): fetch-only via
 * /api/crm/cartera (the API is the hexagonal boundary), status machine
 * loading → ready | error, Spanish API errors surfaced verbatim,
 * retry/refresh re-fetch, and a RE-FETCH when the admin `todas` toggle
 * changes (useColaHoy/useEmpresas model).
 */

const filas: FilaCartera[] = [
  {
    empresaId: 42,
    ruc: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    responsable: 'jperez',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    proximaAccion: 'Enviar seguimiento (vencido hoy)',
  },
];

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildCarteraPath (pure — no mocks)', () => {
  it('builds the own-scope path without the toggle', () => {
    expect(buildCarteraPath(false)).toBe('/api/crm/cartera');
  });

  it('appends todas=true for the admin all-scope path', () => {
    expect(buildCarteraPath(true)).toBe('/api/crm/cartera?todas=true');
  });
});

describe('useCartera', () => {
  it('goes loading → ready and exposes the filas and the echoed scope', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, filas, todas: false }));

    const { result } = renderHook(() => useCartera(false));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.filas).toEqual(filas);
    expect(result.current.todas).toBe(false);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/cartera', { method: 'GET' });
  });

  it('fetches with ?todas=true when the admin toggle is on', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, filas, todas: true }));

    const { result } = renderHook(() => useCartera(true));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/cartera?todas=true', { method: 'GET' });
    expect(result.current.todas).toBe(true);
  });

  it('re-fetches when the todas toggle changes', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, filas, todas: false }));

    const { result, rerender } = renderHook(({ todas }) => useCartera(todas), {
      initialProps: { todas: false },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValue(okResponse({ success: true, filas: [], todas: true }));
    rerender({ todas: true });

    await waitFor(() => expect(result.current.todas).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the API error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'La sesión ya no corresponde a un usuario válido', code: 'UNAUTHORIZED' }), { status: 401 }),
    );

    const { result } = renderHook(() => useCartera(false));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('La sesión ya no corresponde a un usuario válido');
    expect(result.current.filas).toEqual([]);
  });

  it('reports an unexpected shape as an error (filas missing)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, todas: false }));

    const { result } = renderHook(() => useCartera(false));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('reports a network failure as an error', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const { result } = renderHook(() => useCartera(false));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error de red');
  });

  it('recovers via retry after a failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValue(okResponse({ success: true, filas, todas: false }));

    const { result } = renderHook(() => useCartera(false));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.filas).toEqual(filas);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh() re-fetches in place (panel change → list reload)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, filas, todas: false }));

    const { result } = renderHook(() => useCartera(false));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValue(okResponse({ success: true, filas: [], todas: false }));
    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.filas).toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
