import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InformeNoCerradoRow } from '@/types/informe';

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

function makeOrder(overrides: Partial<InformeNoCerradoRow> = {}): InformeNoCerradoRow {
  return {
    idAten: '012110021',
    codEmp: 1,
    codSed: 1,
    codTCl: 2,
    numOrd: 100200,
    fecAte: '17/06/2026',
    codCli: 3331,
    codDCo: 76,
    ...overrides,
  };
}

describe('usePlantillas', () => {
  it('returns the empty-result shape and does NOT fetch when order is null', async () => {
    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', null));

    expect(result.current.state).toEqual({ kind: 'empty' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches /api/informes/[idAten]/plantillas with codCli, emiAfi, incExp when order is non-null', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, []));

    const { usePlantillas } = await import('../usePlantillas');
    renderHook(() => usePlantillas('012110021', makeOrder({ codCli: 3331, codDCo: 76 })));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/api/informes/012110021/plantillas?');
    expect(url).toContain('codCli=3331');
    expect(url).toContain('emiAfi=0');
    expect(url).toContain('incExp=1');
    expect(url).toContain('codDCo=76');
  });

  it('omits codDCo from the query string when the order has it as null', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, []));

    const { usePlantillas } = await import('../usePlantillas');
    renderHook(() => usePlantillas('012110021', makeOrder({ codCli: 3331, codDCo: null })));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('codCli=3331');
    expect(url).not.toContain('codDCo=');
  });

  it('emits the ready state with the plantillas list when the SP returns rows', async () => {
    const items = [
      { codPMe: 100, arcPla: 'exa_aud', ordPri: 1, idePMe: 39053, ideFMe: null },
      { codPMe: 101, arcPla: 'exa_lab', ordPri: 2, idePMe: 39056, ideFMe: null },
    ];
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, items));

    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', makeOrder()));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    if (result.current.state.kind !== 'ready') throw new Error('expected ready');
    expect(result.current.state.items).toHaveLength(2);
    expect(result.current.state.items[0]?.idePMe).toBe(39053);
  });

  it('emits the empty state when the SP returns 0 rows', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, []));

    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', makeOrder()));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(result.current.state).toEqual({ kind: 'empty' });
  });

  it('emits the error state with the HTTP code on a non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(500, { code: 'INTERNAL_ERROR' }));

    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', makeOrder()));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toContain('500');
  });

  it('emits the error state with the underlying message on a network throw', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', makeOrder()));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('error');
    });
    if (result.current.state.kind !== 'error') throw new Error('expected error');
    expect(result.current.state.message).toBe('network down');
  });

  it('transitions back to the empty state when the order is set to null', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(200, [
        { codPMe: 100, arcPla: 'exa_aud', ordPri: 1, idePMe: 39053, ideFMe: null },
      ]),
    );

    const { usePlantillas } = await import('../usePlantillas');
    const { result, rerender } = renderHook(
      ({ order }: { order: InformeNoCerradoRow | null }) =>
        usePlantillas('012110021', order),
      { initialProps: { order: makeOrder() as InformeNoCerradoRow | null } },
    );

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });

    rerender({ order: null });

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetch() re-arms the fetch without changing the args', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, []));
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, []));

    const { usePlantillas } = await import('../usePlantillas');
    const { result } = renderHook(() => usePlantillas('012110021', makeOrder()));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('empty');
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
