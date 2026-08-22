/**
 * Tests for `useCobranzaHistorial(ruc)` (REQ-02, task 7.1/7.2).
 *
 * Spec R4 (per-client history visualization): fetch-on-mount against
 * GET /api/cobranza/historial/[ruc] with a four-state machine —
 * 'loading' | 'ready' | 'error' | 'skipped'. Design §4.1:
 *  - junk keys (non 8–11 digit after trim) NEVER hit the API —
 *    'skipped' state, zero fetches (the audit log is write-only for
 *    them; the server 400s as defense in depth);
 *  - an empty `envios` array is a VALID "no sends yet" state (part
 *    of 'ready', not a separate state);
 *  - stale-guard + unmount safety via request ids (useCompanyContact
 *    precedent);
 *  - unknown response shape → 'Respuesta inesperada del servidor'.
 *
 * Mocking strategy: `fetch` mocked at the global boundary — the API
 * route is the hook's only dependency (hexagonal, fetch-only).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCobranzaHistorial } from '../useCobranzaHistorial';
import type { CobranzaEnvioHistorial } from '../../../domain/entities';

const SAMPLE_ENVIO: CobranzaEnvioHistorial = {
  id: 42,
  ruc: '20601234567',
  razonSocial: 'HOLOMEDIC S.A.C.',
  destinatarios: ['contacto@empresa.com'],
  copias: null,
  asunto: 'Recordatorio de pago',
  montoReclamado: 1000,
  moneda: 'S/',
  comprobantesCount: 1,
  estadoEnvio: 'SUCCESS',
  errorDetalle: null,
  enviadoPor: 'María Pérez',
  fechaEnvio: '2026-08-22T14:30:00.000Z',
};

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('useCobranzaHistorial', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports loading then ready with the audited rows on a 200 (spec: history loads on modal open)', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: [SAMPLE_ENVIO] }));

    const { result } = renderHook(() => useCobranzaHistorial('20601234567'));

    expect(result.current.status).toBe('loading');
    expect(result.current.envios).toEqual([]);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.envios).toEqual([SAMPLE_ENVIO]);
    expect(result.current.error).toBeNull();
  });

  it('GETs /api/cobranza/historial/{trimmed ruc}', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: [] }));

    renderHook(() => useCobranzaHistorial(' 20601234567 '));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/cobranza/historial/20601234567');
    expect(init?.method).toBe('GET');
  });

  it('reports ready with an empty list on a 200 with envios [] (valid no-sends-yet state)', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: [] }));

    const { result } = renderHook(() => useCobranzaHistorial('20601234567'));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.envios).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('skips the fetch entirely for a junk key — status "skipped"', async () => {
    const { result } = renderHook(() => useCobranzaHistorial('CLIENTE SIN NOMBRE'));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });
    expect(result.current.envios).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the fetch for an empty/whitespace ruc — status "skipped"', async () => {
    const { result } = renderHook(() => useCobranzaHistorial('   '));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retry does nothing while the key is junk (no fetch, stays skipped)', async () => {
    const { result } = renderHook(() => useCobranzaHistorial('ABC-123'));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });

    act(() => {
      result.current.retry();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('skipped');
  });

  it('reports error with the API message on a non-OK response, and retry recovers', async () => {
    fetchMock.mockResolvedValue(
      res({ success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' }, false, 500),
    );

    const { result } = renderHook(() => useCobranzaHistorial('20601234567'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('INTERNAL_ERROR');
    expect(result.current.envios).toEqual([]);

    fetchMock.mockResolvedValue(res({ success: true, envios: [SAMPLE_ENVIO] }));

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.envios).toEqual([SAMPLE_ENVIO]);
  });

  it('reports error on a network failure (fetch rejects)', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCobranzaHistorial('20601234567'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('Network down');
  });

  it('reports error when the response body has an unexpected shape', async () => {
    fetchMock.mockResolvedValue(res({ data: 'unexpected' }));

    const { result } = renderHook(() => useCobranzaHistorial('20601234567'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toMatch(/inesperada|unexpected/i);
  });

  it('a ruc change invalidates the in-flight response of the previous key', async () => {
    // First key never settles until we say so; second key resolves immediately.
    let resolveFirst: (value: Response) => void = () => {};
    const firstPending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    fetchMock.mockImplementationOnce(() => firstPending);
    fetchMock.mockResolvedValue(res({ success: true, envios: [] }));

    const { result, rerender } = renderHook(
      ({ ruc }: { ruc: string }) => useCobranzaHistorial(ruc),
      { initialProps: { ruc: '20601234567' } },
    );

    rerender({ ruc: '10444555666' });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // The STALE response of the first key lands now — it must be discarded.
    await act(async () => {
      resolveFirst(res({ success: true, envios: [SAMPLE_ENVIO] }));
      // Let microtasks flush so a missing stale-guard would surface.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.envios).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
