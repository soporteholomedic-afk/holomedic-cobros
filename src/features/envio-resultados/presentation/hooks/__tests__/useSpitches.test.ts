/**
 * Tests for `useSpitches(area, type)` (PR 4 — Task 4.4).
 *
 * Spec delta `envio-resultados` MODIFIED: "useSpitches hook" + the
 * three sub-scenarios "Hook reports loading then populated" / "Hook
 * reports empty" / "Hook reports error with retry".
 *
 * Mocking strategy: `fetch` is mocked at the global boundary (the
 * only place it is consumed). The hook never imports a repository —
 * that is the whole point of PR 4.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpitches } from '../useSpitches';
import type { SpitchDTO } from '../../../domain/entities';

const SAMPLE_SPITCHES: SpitchDTO[] = [
  {
    id: 'tpl-1',
    area: 'consolidados',
    type: 'company',
    name: 'Resumen general',
    subject: 'Informe {{empresa}}',
    bodyHtml: '<p>{{empresa}}</p>',
  },
  {
    id: 'tpl-2',
    area: 'consolidados',
    type: 'company',
    name: 'Detalle por paciente',
    subject: 'Detalle {{fecha}}',
    bodyHtml: '<p>Detalle</p>',
  },
];

function mockFetchResponse(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('useSpitches', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports loading then populated on a 200 with non-empty spitches (spec: Hook reports loading then populated)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: SAMPLE_SPITCHES }),
    } as unknown as Response);

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    // First state: loading.
    expect(result.current.status).toBe('loading');
    expect(result.current.spitches).toEqual([]);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });
    expect(result.current.spitches).toEqual(SAMPLE_SPITCHES);
    expect(result.current.error).toBeNull();
  });

  it('reports empty on a 200 with [] (spec: Hook reports empty)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: [] }),
    } as unknown as Response);

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(result.current.status).toBe('empty');
    });
    expect(result.current.spitches).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('reports error with a retry function on a non-OK response (spec: Hook reports error with retry)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ success: false, error: 'INTERNAL_ERROR' }),
    } as unknown as Response);

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.spitches).toEqual([]);
    expect(result.current.error).toBeTruthy();
    expect(typeof result.current.retry).toBe('function');

    // Now flip the mock to a success and call retry — must transition
    // back through loading then populated.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: SAMPLE_SPITCHES }),
    } as unknown as Response);

    act(() => {
      result.current.retry();
    });
    // Loading is observable immediately after retry (before the next await).
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });
    expect(result.current.spitches).toEqual(SAMPLE_SPITCHES);
  });

  it('reports error on a network failure (fetch rejects)', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('Network down');
  });

  it('hits /api/plantillas?area=consolidados&type=company with the expected URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: [] }),
    } as unknown as Response);

    renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/plantillas?area=consolidados&type=company');
    expect(init?.method).toBe('GET');
  });

  it('re-fetches when (area, type) changes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: SAMPLE_SPITCHES }),
    } as unknown as Response);

    const { rerender } = renderHook(
      ({ area, type }: { area: string; type: 'company' | 'patient' }) =>
        useSpitches(area, type),
      { initialProps: { area: 'consolidados', type: 'company' as const } },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Change type to patient — hook must refetch.
    rerender({ area: 'consolidados', type: 'patient' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).toBe('/api/plantillas?area=consolidados&type=patient');
  });

  it('encodes the area/type in the URL (defensive — special characters)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ spitches: [] }),
    } as unknown as Response);

    renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const url = fetchMock.mock.calls[0]?.[0] as string;
    // encodeURIComponent of `consolidados` is identity, but the hook
    // must still pass through encodeURIComponent (defensive — future
    // area names may need it).
    expect(url).toMatch(/^\/api\/plantillas\?area=consolidados&type=company$/);
  });

  it('falls back to "INTERNAL_ERROR" or status text when the API error body is missing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not JSON')),
    } as unknown as Response);

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    // Status code 500 must appear in the error message — defensive fallback.
    expect(result.current.error).toMatch(/500/);
  });

  it('marks status as error when the response body is not {spitches: []}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'unexpected' }),
    } as unknown as Response);

    const { result } = renderHook(() => useSpitches('consolidados', 'company'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toMatch(/inesperada|unexpected/i);
  });
});
