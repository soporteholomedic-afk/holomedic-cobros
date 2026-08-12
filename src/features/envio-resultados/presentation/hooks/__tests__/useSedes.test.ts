import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSedes } from '../useSedes';
import type { SedeRow } from '@/types/sp-result';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockSedes: SedeRow[] = [
  { codSed: 1, nomSed: 'SEDE SURQUILLO' },
  { codSed: 2, nomSed: 'CAMPAÑA (HISTORICO)' },
  { codSed: 3, nomSed: 'CAMPAÑA' },
];

describe('useSedes', () => {
  it('loads sedes from /api/consolidados/sedes on mount', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sedes: mockSedes }),
    });

    const { result } = renderHook(() => useSedes());

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sedes).toEqual(mockSedes);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/consolidados/sedes');
  });

  it('sets error and empty sedes when the fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useSedes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sedes).toEqual([]);
    expect(result.current.error).toBe('Error al cargar las sedes');
  });

  it('sets error when the response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useSedes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sedes).toEqual([]);
    expect(result.current.error).toBe('Error al cargar las sedes');
  });

  it('does not set state after unmount (cancellation flag)', async () => {
    const pending = new Promise<Response>(() => {});
    mockFetch.mockReturnValue(pending);

    const { unmount } = renderHook(() => useSedes());
    unmount();

    // Yield to microtasks; no errors should be thrown post-unmount
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
