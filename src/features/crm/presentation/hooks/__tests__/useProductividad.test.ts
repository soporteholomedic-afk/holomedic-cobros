import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { buildProductividadPath, useProductividad } from '../useProductividad';
import type { FilaProductividad } from '../../../application/listarProductividad';

/**
 * Hook contract for the productivity view (tasks pr16/WU3, spec G6):
 * fetch-only via /api/crm/productividad (the API is the hexagonal
 * boundary), status machine loading → ready | error, Spanish API
 * errors surfaced verbatim, retry re-fetches, and a RE-FETCH when the
 * selected period changes (useCartera's toggle model).
 */

const filas: FilaProductividad[] = [
  {
    usuario: 'jperez',
    actividades: 10,
    resultados: 3,
    porEvento: {
      CotizaciónEnviada: 2,
      PresentaciónEnviada: 0,
      AceptaciónOutbound: 0,
      ConfirmaciónPresentación: 0,
      HandoffRegistrado: 0,
      ConversiónProspectoACliente: 1,
    },
  },
];

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function productividadOk(filasRespuesta: FilaProductividad[]): Response {
  return okResponse({ success: true, desde: '2026-09-01', hasta: '2026-09-30', filas: filasRespuesta });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildProductividadPath (pure — no mocks)', () => {
  it('encodes the selected period as query params', () => {
    expect(buildProductividadPath('2026-09-01', '2026-09-30')).toBe(
      '/api/crm/productividad?desde=2026-09-01&hasta=2026-09-30',
    );
  });

  it('keeps single-digit months/days verbatim (the server re-validates)', () => {
    expect(buildProductividadPath('2026-02-01', '2026-02-28')).toBe(
      '/api/crm/productividad?desde=2026-02-01&hasta=2026-02-28',
    );
  });
});

describe('useProductividad', () => {
  it('goes loading → ready and exposes the summary rows', async () => {
    fetchMock.mockResolvedValue(productividadOk(filas));

    const { result } = renderHook(() => useProductividad('2026-09-01', '2026-09-30'));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.filas).toEqual(filas);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/crm/productividad?desde=2026-09-01&hasta=2026-09-30',
      { method: 'GET' },
    );
  });

  it('re-fetches when the period changes', async () => {
    fetchMock.mockResolvedValue(productividadOk(filas));

    const { result, rerender } = renderHook(
      ({ desde, hasta }) => useProductividad(desde, hasta),
      { initialProps: { desde: '2026-09-01', hasta: '2026-09-30' } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValue(productividadOk([]));
    rerender({ desde: '2026-08-01', hasta: '2026-08-31' });

    await waitFor(() => expect(result.current.filas).toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/crm/productividad?desde=2026-08-01&hasta=2026-08-31',
      { method: 'GET' },
    );
  });

  it('surfaces the API error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: '"desde" y "hasta" son fechas obligatorias con formato AAAA-MM-DD',
          code: 'VALIDATION_ERROR',
        }),
        { status: 400 },
      ),
    );

    const { result } = renderHook(() => useProductividad('malformed', '2026-09-30'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      '"desde" y "hasta" son fechas obligatorias con formato AAAA-MM-DD',
    );
    expect(result.current.filas).toEqual([]);
  });

  it('reports an unexpected shape as an error (filas missing)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true }));

    const { result } = renderHook(() => useProductividad('2026-09-01', '2026-09-30'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('reports a network failure as an error', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const { result } = renderHook(() => useProductividad('2026-09-01', '2026-09-30'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error de red');
  });

  it('retry() re-fetches after a failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'db', code: 'INTERNAL_ERROR' }), { status: 500 }),
    );
    const { result } = renderHook(() => useProductividad('2026-09-01', '2026-09-30'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    fetchMock.mockResolvedValue(productividadOk(filas));
    result.current.retry();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.filas).toEqual(filas);
  });
});
