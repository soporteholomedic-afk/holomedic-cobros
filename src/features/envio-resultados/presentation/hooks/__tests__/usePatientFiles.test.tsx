import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@/features/envio-resultados/domain/ports';

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

// Use a real timer to test `loading: true` properly via `waitFor`.
function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('usePatientFiles', () => {
  it('returns the empty-result shape and does NOT fetch when any arg is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { files: [] }));

    const { usePatientFiles } = await import('../usePatientFiles');
    const { result } = renderHook(() => usePatientFiles('', '12345678', 'AT-001'));

    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches and stores the file list on a 200 response with files', async () => {
    const files: FileEntry[] = [
      { name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' },
      { name: 'foto.jpg', sizeBytes: 200, modifiedAt: '2026-06-02T00:00:00.000Z' },
    ];
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { files }));

    const { usePatientFiles } = await import('../usePatientFiles');
    const { result } = renderHook(() => usePatientFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.files).toEqual(files);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/list?ruc=RUC&dni=12345678&idAten=AT-001'),
    );
  });

  it('treats 200 + { files: [] } as the empty state, NOT an error', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { files: [] }));

    const { usePatientFiles } = await import('../usePatientFiles');
    const { result } = renderHook(() => usePatientFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes a non-2xx response as an error and clears the file list', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(502, { error: 'oops' }));

    const { usePatientFiles } = await import('../usePatientFiles');
    const { result } = renderHook(() => usePatientFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('reissues the request when refetch() is called', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, { files: [] }));
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, {
        files: [
          { name: 'a.pdf', sizeBytes: 1, modifiedAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
    );

    const { usePatientFiles } = await import('../usePatientFiles');
    const { result } = renderHook(() => usePatientFiles('RUC', '12345678', 'AT-001'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.files).toEqual([]);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
