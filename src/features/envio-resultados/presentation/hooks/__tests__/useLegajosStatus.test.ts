import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLegajosStatus } from '../useLegajosStatus';

function mockFetchResponse(data: unknown, ok = true, statusText = 'OK'): Response {
  return {
    ok,
    statusText,
    json: () => Promise.resolve(data),
  } as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useLegajosStatus', () => {
  it('should initialize with default states', () => {
    const { result } = renderHook(() => useLegajosStatus());
    expect(result.current.statuses).toEqual({});
    expect(result.current.isChecking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should batch check all items and transition states successfully', async () => {
    const mockData = {
      'ATE-001': { hasCamo: true, hasEmo: false },
      'ATE-002': { hasCamo: false, hasEmo: true },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(mockData)
    );

    const { result } = renderHook(() => useLegajosStatus());

    const items = [
      { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
      { ruc: '20123456789', dni: '87654321', idAten: 'ATE-002' },
    ];

    let checkPromise: Promise<void>;
    act(() => {
      checkPromise = result.current.checkAll(items);
    });

    expect(result.current.isChecking).toBe(true);
    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: false,
      hasEmo: false,
      loading: true,
    });
    expect(result.current.statuses['ATE-002']).toEqual({
      hasCamo: false,
      hasEmo: false,
      loading: true,
    });

    await act(async () => {
      await checkPromise;
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: true,
      hasEmo: false,
      loading: false,
      error: undefined,
    });
    expect(result.current.statuses['ATE-002']).toEqual({
      hasCamo: false,
      hasEmo: true,
      loading: false,
      error: undefined,
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/files/check-legajos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(items),
    });
  });

  it('should capture response-level error and propagate hook-level error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse(null, false, 'Internal Server Error')
    );

    const { result } = renderHook(() => useLegajosStatus());

    const items = [
      { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
    ];

    await act(async () => {
      await result.current.checkAll(items);
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.error).toContain('Internal Server Error');
    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: false,
      hasEmo: false,
      loading: false,
      error: 'Error en la solicitud: Internal Server Error',
    });
  });

  it('should handle fetch throw error and propagate to all check items', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLegajosStatus());

    const items = [
      { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' },
      { ruc: '20123456789', dni: '87654321', idAten: 'ATE-002' },
    ];

    await act(async () => {
      await result.current.checkAll(items);
    });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.error).toBe('Network error');
    expect(result.current.statuses['ATE-001'].error).toBe('Network error');
    expect(result.current.statuses['ATE-002'].error).toBe('Network error');
  });

  it('should trigger single row retry check via checkRow', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({
        'ATE-001': { hasCamo: true, hasEmo: true },
      })
    );

    const { result } = renderHook(() => useLegajosStatus());

    const item = { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' };

    let checkPromise: Promise<void>;
    act(() => {
      checkPromise = result.current.checkRow(item);
    });

    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: false,
      hasEmo: false,
      loading: true,
    });

    await act(async () => {
      await checkPromise;
    });

    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: true,
      hasEmo: true,
      loading: false,
      error: undefined,
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/files/check-legajos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([item]),
    });
  });

  it('should handle single row errors in checkRow without setting hook-level error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Row failed'));

    const { result } = renderHook(() => useLegajosStatus());

    const item = { ruc: '20123456789', dni: '12345678', idAten: 'ATE-001' };

    await act(async () => {
      await result.current.checkRow(item);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.statuses['ATE-001']).toEqual({
      hasCamo: false,
      hasEmo: false,
      loading: false,
      error: 'Row failed',
    });
  });
});
