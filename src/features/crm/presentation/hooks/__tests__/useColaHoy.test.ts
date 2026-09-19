import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildColaPath, useColaHoy } from '../useColaHoy';
import type { ColaHoy } from '../../../application/listarColaHoy';

/**
 * Hook contract for the daily queue (tasks pr13/WU3): fetch-only via
 * /api/crm/cola (the API is the hexagonal boundary), status machine
 * loading → ready | error, Spanish API errors surfaced verbatim,
 * retry/refresh re-fetch (useEmpresaDetalle model).
 */

const cola: ColaHoy = {
  vencidasHoy: [
    {
      empresaId: 10,
      flujo: 'OUTBOUND',
      etapa: 'CADENCIA',
      ciclo: 1,
      enviosCiclo: 1,
      fechaCicloInicio: '2026-05-25',
      fechaUltimoEnvio: '2026-05-25',
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
      updatedBy: null,
      updatedAt: '2026-05-25T00:00:00.000Z',
      razonSocial: 'Constructora X',
      responsable: 'jperez',
    },
  ],
  reinicios: [],
  decisionRequerida: [],
  reactivables: [],
};

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

describe('buildColaPath (pure — no mocks)', () => {
  it('builds the queue API path', () => {
    expect(buildColaPath()).toBe('/api/crm/cola');
  });
});

describe('useColaHoy', () => {
  it('goes loading → ready and exposes the four sections', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, ...cola }));

    const { result } = renderHook(() => useColaHoy());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.cola).toEqual(cola);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/cola', { method: 'GET' });
  });

  it('surfaces the API error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
    );

    const { result } = renderHook(() => useColaHoy());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('No autorizado');
    expect(result.current.cola).toBeNull();
  });

  it('reports an unexpected shape as an error (sections missing)', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, vencidasHoy: 'nope' }));

    const { result } = renderHook(() => useColaHoy());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('reports a network failure as an error', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const { result } = renderHook(() => useColaHoy());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error de red');
  });

  it('recovers via retry after a failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValue(okResponse({ success: true, ...cola }));

    const { result } = renderHook(() => useColaHoy());

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.cola).toEqual(cola);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
