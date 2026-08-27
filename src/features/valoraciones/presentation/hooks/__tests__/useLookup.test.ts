import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLookup } from '../useLookup';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mockFetchOnce(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Advance fake timers AND flush microtasks inside act (commits state). */
async function flush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useLookup', () => {
  it('stays idle (no fetch, empty items) when disabled', async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });
    const { result } = renderHook(() =>
      useLookup('clientes', { q: 'de' }, { habilitado: false }),
    );

    await flush(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.cargando).toBe(false);
  });

  it('debounces param changes before fetching', async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });
    const { rerender } = renderHook(({ q }: { q: string }) => useLookup('clientes', { q }), {
      initialProps: { q: 'ho' },
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).not.toHaveBeenCalled();

    await flush(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/valoraciones/lookups/clientes?q=ho');

    // Changing the param refetches; the value key ignores object identity.
    rerender({ q: 'hola' });
    await flush(260);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/valoraciones/lookups/clientes?q=hola');
  });

  it('maps resultados onto items', async () => {
    mockFetchOnce({
      resultados: [{ codCli: 1, nomCom: 'CLIENTE A', nroRuc: '2048' }],
    });
    const { result } = renderHook(() =>
      useLookup<{ codCli: number; nomCom: string }>('clientes', { q: 'cli' }),
    );

    await flush(300);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toEqual({ codCli: 1, nomCom: 'CLIENTE A', nroRuc: '2048' });
    expect(result.current.cargando).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches without query params for mount-time lookups', async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });
    renderHook(() => useLookup('sedes', {}, { habilitado: true }));

    await flush(300);
    expect(fetchMock).toHaveBeenCalledWith('/api/valoraciones/lookups/sedes');
  });

  it('surfaces API errors with empty items', async () => {
    mockFetchOnce({ error: '"q" es obligatorio' }, false, 400);
    const { result } = renderHook(() =>
      useLookup('clientes', { q: 'cli' }),
    );

    await flush(300);
    expect(result.current.error).toBe('"q" es obligatorio');
    expect(result.current.items).toEqual([]);
  });

  it('reports connection failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() =>
      useLookup('destinos', { codCli: '5' }),
    );

    await flush(300);
    expect(result.current.error).toBe('Error de conexión');
    expect(result.current.items).toEqual([]);
  });

  it('passes codCli for destinos and refetches when the client changes', async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });
    const { rerender } = renderHook(
      ({ codCli }: { codCli: number }) =>
        useLookup('destinos', { codCli: String(codCli) }, { habilitado: codCli > 0 }),
      { initialProps: { codCli: 0 } },
    );

    await flush(300);
    expect(fetchMock).not.toHaveBeenCalled(); // no client → no fetch (spec Q-R4)

    rerender({ codCli: 12 });
    await flush(300);
    expect(fetchMock).toHaveBeenCalledWith('/api/valoraciones/lookups/destinos?codCli=12');
  });
});
