import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Module boundary mock: fetch ----

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useInformeOrder', () => {
  it('returns the empty-result shape and does NOT fetch when idAten is empty', async () => {
    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('', '17/06/2026'));

    expect(result.current.state).toEqual({ kind: 'empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the empty-result shape and does NOT fetch when fecAte is empty', async () => {
    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', ''));

    expect(result.current.state).toEqual({ kind: 'empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches /api/informes/[idAten]/lookup with fecAte in the query string', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, {
        idAten: '012110021',
        codEmp: 1,
        codSed: 1,
        codTCl: 2,
        numOrd: 100200,
        fecAte: '17/06/2026',
        codCli: 3331,
        codDCo: 76,
      }),
    );

    const { useInformeOrder } = await import('../useInformeOrder');
    renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/informes/012110021/lookup?fecAte=17%2F06%2F2026');
  });

  it('emits the ready state with the row when the SP returns a match', async () => {
    const row = {
      idAten: '012110021',
      codEmp: 1,
      codSed: 1,
      codTCl: 2,
      numOrd: 100200,
      fecAte: '17/06/2026',
      codCli: 3331,
      codDCo: 76,
    };
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, row));

    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    if (result.current.state.kind !== 'ready') throw new Error('expected ready');
    expect(result.current.state.row).toEqual(row);
  });

  it('emits the empty state (NOT an error) when the route returns 404', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(404, { code: 'NOT_FOUND' }));

    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(result.current.state).toEqual({ kind: 'empty' });
  });

  it('emits the error state with the HTTP code in the message on a non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(500, { code: 'INTERNAL_ERROR' }));

    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toContain('500');
  });

  it('emits the error state with the underlying message on a network throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toBe('network down');
  });

  it('refetch() re-arms the fetch without changing the args', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, {
        idAten: '012110021',
        codEmp: 1,
        codSed: 1,
        codTCl: 2,
        numOrd: 100200,
        fecAte: '17/06/2026',
        codCli: 3331,
        codDCo: 76,
      }),
    );

    const { useInformeOrder } = await import('../useInformeOrder');
    const { result } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Queue a second OK response for the refetch.
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, {
        idAten: '012110021',
        codEmp: 1,
        codSed: 1,
        codTCl: 2,
        numOrd: 100200,
        fecAte: '17/06/2026',
        codCli: 3331,
        codDCo: 76,
      }),
    );

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it('aborts the in-flight request when the hook unmounts', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise<Response>(() => {
        /* never resolves */
      });
    });

    const { useInformeOrder } = await import('../useInformeOrder');
    const { unmount } = renderHook(() => useInformeOrder('012110021', '17/06/2026'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
