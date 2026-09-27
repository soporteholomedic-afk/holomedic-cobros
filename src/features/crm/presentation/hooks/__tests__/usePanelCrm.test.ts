import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildPanelPath, INTERVALO_ACTUALIZACION_MS, usePanelCrm } from '../usePanelCrm';
import type { FilaPanelCrm } from '../../../domain/ports';

/**
 * Hook contract for the operator panel (tasks 8.1, design D4, OP-1):
 * fetch-only via /api/crm/panel (the API route is the boundary —
 * useColaHoy precedent), status machine loading → ready | error, and
 * the crm-ux silent auto-refresh (30s interval + window focus) that
 * never flashes loading and keeps the stale panel on failure
 * (stale-while-error). The hook derives panel rows/counts CLIENT-SIDE
 * from the payload — with `hoy` taken from the SERVER response
 * (server-authoritative date, batch-9 watch item).
 */

const HOY = '2026-09-15';

function fila(overrides: Partial<FilaPanelCrm> = {}): FilaPanelCrm {
  return {
    empresaId: 1,
    razonSocial: 'Constructora X',
    ruc: '20489561234',
    tipo: 'Prospecto',
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-09-01T00:00:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-08',
    fechaUltimoEnvio: '2026-09-08',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Carlos Mendoza',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'carlos@constructora.com',
    ...overrides,
  };
}

const filas = [
  fila({ empresaId: 1 }),
  fila({ empresaId: 2, flujo: null, etapa: null, ciclo: null, enviosCiclo: null, fechaCicloInicio: null, fechaUltimoEnvio: null }),
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

describe('buildPanelPath (pure — no mocks)', () => {
  it('builds the panel API path', () => {
    expect(buildPanelPath()).toBe('/api/crm/panel');
  });
});

describe('usePanelCrm', () => {
  it('goes loading → ready and derives rows + counts from the payload', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));

    const { result } = renderHook(() => usePanelCrm());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/panel', { method: 'GET' });
    // The payload is DERIVED client-side: carta_enviada + sin_carta.
    expect(result.current.panel?.hoy).toBe(HOY); // server date, verbatim
    expect(result.current.panel?.filas.map((f) => f.estado)).toEqual(['carta_enviada', 'sin_carta']);
    expect(result.current.panel?.conteos).toMatchObject({ todas: 2, enEspera: 1, faltaCarta: 1 });
  });

  it('surfaces the API error and recovers via retry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
      )
      .mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));

    const { result } = renderHook(() => usePanelCrm());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('No autorizado');
    expect(result.current.panel).toBeNull();

    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.panel?.conteos.todas).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports an unexpected shape as an error (hoy/filas missing)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, filas: 'nope' }));

    const { result } = renderHook(() => usePanelCrm());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('auto-refreshes silently on the interval — no loading flash while a refresh is pending', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));
      const { result } = renderHook(() => usePanelCrm());
      await act(async () => {});
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('ready');

      // The interval fires while the silent request is PENDING — the
      // panel must NOT flash back to loading nor lose its data.
      let resolver: (r: Response) => void = () => {};
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((res) => {
          resolver = res;
        }),
      );
      await act(async () => {
        vi.advanceTimersByTime(INTERVALO_ACTUALIZACION_MS);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe('ready');
      expect(result.current.panel?.conteos.todas).toBe(2);

      await act(async () => {
        resolver(okResponse({ success: true, hoy: HOY, filas }));
      });
      expect(result.current.status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('refetches silently when the window regains focus', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));
    const { result } = renderHook(() => usePanelCrm());
    await act(async () => {});
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {});
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });

  it('keeps the stale panel when a silent refresh fails (stale-while-error)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ success: true, hoy: HOY, filas }));
    const { result } = renderHook(() => usePanelCrm());
    await act(async () => {});
    await act(async () => {});
    expect(result.current.status).toBe('ready');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {});
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
    expect(result.current.panel?.conteos.todas).toBe(2);
    expect(result.current.error).toBeNull();
  });
});
