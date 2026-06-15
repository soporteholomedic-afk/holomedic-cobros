import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock `fetch` at the module boundary so the hook test never reaches
// the network. Default OK; individual tests override per case.
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

describe('useReadyFiles', () => {
  it('returns the empty-result shape and does NOT fetch when any arg is empty', async () => {
    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('', '12345678', 'AT-001'));

    expect(result.current.state).toEqual({ kind: 'empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches /api/files/list-folder with path=LEGAJOS on mount with valid args', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { nodes: [] }));

    const { useReadyFiles } = await import('../useReadyFiles');
    renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/api/files/list-folder?');
    expect(url).toContain('ruc=RUC');
    expect(url).toContain('dni=12345678');
    expect(url).toContain('idAten=AT-001');
    expect(url).toContain('path=LEGAJOS');
  });

  it('emits the ready state with ONLY files that match the ready pattern (folders dropped, non-matching files dropped)', async () => {
    const serializedNodes = [
      { kind: 'folder', name: 'subdir' },
      { kind: 'file', name: '75618561CERT.pdf', sizeBytes: 1024, modifiedAt: '2026-06-01T00:00:00.000Z' },
      { kind: 'file', name: '012109975EXPED.pdf', sizeBytes: 2048, modifiedAt: '2026-06-02T00:00:00.000Z' },
      { kind: 'file', name: 'informe.pdf', sizeBytes: 4096, modifiedAt: '2026-06-03T00:00:00.000Z' },
      { kind: 'file', name: 'ABC123CERT.pdf', sizeBytes: 8192, modifiedAt: '2026-06-04T00:00:00.000Z' },
    ];
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { nodes: serializedNodes }));

    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    if (result.current.state.kind !== 'ready') throw new Error('expected ready');
    expect(result.current.state.files).toHaveLength(2);
    expect(result.current.state.files.map((f) => f.name)).toEqual([
      '75618561CERT.pdf',
      '012109975EXPED.pdf',
    ]);
    // Verify the files are re-hydrated FileNodes (Composite methods present).
    const [first] = result.current.state.files;
    expect(first?.kind).toBe('file');
    expect(typeof first?.accept).toBe('function');
  });

  it('treats 200 with no matching files as the empty state', async () => {
    const serializedNodes = [
      { kind: 'file', name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' },
      { kind: 'folder', name: 'subdir' },
    ];
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { nodes: serializedNodes }));

    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(result.current.state).toEqual({ kind: 'empty' });
  });

  it('treats 200 with { nodes: [] } (missing LEGAJOS folder) as the empty state, NOT an error', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { nodes: [] }));

    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(result.current.state).toEqual({ kind: 'empty' });
  });

  it('exposes a non-2xx response as an error state', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(502, { error: 'oops' }));

    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toContain('502');
  });

  it('exposes a thrown fetch as an error state with the underlying message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const { useReadyFiles } = await import('../useReadyFiles');
    const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toBe('network down');
  });

  it('aborts the in-flight request when the hook unmounts', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise(() => {
        /* never resolves */
      });
    });

    const { useReadyFiles } = await import('../useReadyFiles');
    const { unmount } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('starts in the loading state before the fetch resolves', () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    // Synchronously inspect the first render — no `await waitFor`.
    const useReadyFilesPromise = import('../useReadyFiles');
    return useReadyFilesPromise.then(({ useReadyFiles }) => {
      const { result } = renderHook(() => useReadyFiles('RUC', '12345678', 'AT-001'));
      expect(result.current.state.kind).toBe('loading');
    });
  });
});
