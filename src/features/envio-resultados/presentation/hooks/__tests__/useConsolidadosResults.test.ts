import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useConsolidadosResults } from '../useConsolidadosResults';
import type { CompanyGroup, SpResultRow } from '@/types/sp-result';

const mockFetch = vi.fn();

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (resolve) resolve(value);
    },
    reject: (reason?: unknown) => {
      if (reject) reject(reason);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockRows: SpResultRow[] = [
  {
    NroDId: '12345678',
    Pacien: 'GARCIA LOPEZ JUAN',
    NomCom: 'ACME S.A.',
    DesTCh: 'PREOCUPACIONAL',
    FecAte: '2026-06-15',
    Condic: 'APTO',
  } as SpResultRow,
];

const mockCompanies: CompanyGroup[] = [
  { companyName: 'ACME S.A.', workers: [], workerCount: 1 },
];

describe('useConsolidadosResults', () => {
  it('fetches /api/consolidados/results with the given dates and returns rows + companies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: mockRows, companies: mockCompanies }),
    });

    const { result } = renderHook(() =>
      useConsolidadosResults('2026-06-01', '2026-06-30'),
    );

    // Initial state: loading=true
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.rows).toEqual([]);
    expect(result.current.companies).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.rows).toEqual(mockRows);
    expect(result.current.companies).toEqual(mockCompanies);
    expect(result.current.error).toBeNull();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/consolidados/results');
    expect(url).toContain('fechaInicio=2026-06-01');
    expect(url).toContain('fechaFin=2026-06-30');
  });

  it('re-fetches when dates change', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], companies: [] }),
    });

    const { result, rerender } = renderHook(
      ({ inicio, fin }: { inicio: string; fin: string }) =>
        useConsolidadosResults(inicio, fin),
      { initialProps: { inicio: '2026-06-01', fin: '2026-06-30' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ inicio: '2026-07-01', fin: '2026-07-31' });

    // After params change, hook resets to loading=true and refetches
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondCallUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('fechaInicio=2026-07-01');
    expect(secondCallUrl).toContain('fechaFin=2026-07-31');
  });

  it('aborts the in-flight fetch on unmount (no state update after unmount)', async () => {
    const deferred = createDeferred<Response>();
    mockFetch.mockReturnValue(deferred.promise);

    const { result, unmount } = renderHook(() =>
      useConsolidadosResults('2026-06-01', '2026-06-30'),
    );

    expect(result.current.loading).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the AbortController signal was passed to fetch
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal');

    unmount();

    // Resolve the pending fetch after unmount
    deferred.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [], companies: [] }),
    } as Response);

    // Yield to microtasks; no errors should be thrown post-unmount
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('sets error and clears rows/companies when response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() =>
      useConsolidadosResults('2026-06-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toMatch(/Error al cargar/i);
    expect(result.current.rows).toEqual([]);
    expect(result.current.companies).toEqual([]);
  });

  it('sets error and clears rows/companies when fetch rejects with a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() =>
      useConsolidadosResults('2026-06-01', '2026-06-30'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toMatch(/Error al cargar/i);
    expect(result.current.rows).toEqual([]);
    expect(result.current.companies).toEqual([]);
  });

  it('re-fetches when retryNonce changes (with the same dates)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: [], companies: [] }),
    });

    const { result, rerender } = renderHook(
      ({ nonce }: { nonce: number }) =>
        useConsolidadosResults('2026-06-01', '2026-06-30', nonce),
      { initialProps: { nonce: 0 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ nonce: 1 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Same URL — only the nonce changed.
    const [url1] = mockFetch.mock.calls[0];
    const [url2] = mockFetch.mock.calls[1];
    expect(url1).toBe(url2);
  });
});
