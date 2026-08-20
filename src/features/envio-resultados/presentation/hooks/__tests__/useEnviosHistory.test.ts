import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEnviosHistory } from '../useEnviosHistory';
import type { EnvioHistorySummary } from '@/features/envio-resultados/domain/entities';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

function okResponse(payload: Record<string, unknown>) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

function makeRow(id: string): EnvioHistorySummary {
  return {
    id,
    sentAt: '2026-06-15T15:30:00.000Z',
    status: 'enviado',
    errorDetail: null,
    sentBy: 'jperez',
    destino: 'UNACEM',
    companyId: 'c-1',
    companyName: 'ACME S.A.',
    nombreCompleto: 'GARCIA LOPEZ JUAN',
    toRecipients: ['destino@acme.com'],
    ccRecipients: [],
    subject: 'Resultados consolidados',
    attachments: [],
  };
}

describe('useEnviosHistory', () => {
  it('starts loading and fetches the bare URL when all params are empty', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEnviosHistory('', '', '', 1));

    expect(result.current.loading).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/consolidados/envios');
  });

  it('sends q, date range and page>1 as query params', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderHook(() => useEnviosHistory('acme', '2026-06-01', '2026-06-30', 3));

    expect(mockFetch.mock.calls[0][0]).toBe(
      '/api/consolidados/envios?q=acme&fechaInicio=2026-06-01&fechaFin=2026-06-30&page=3',
    );
  });

  it('exposes rows, total, page and pageSize from the API payload', async () => {
    const rows = [makeRow('env-1'), makeRow('env-2')];
    mockFetch.mockResolvedValue(
      okResponse({ success: true, rows, total: 47, page: 3, pageSize: 20 }),
    );

    const { result } = renderHook(() => useEnviosHistory('', '', '', 3));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.rows).toEqual(rows);
    expect(result.current.total).toBe(47);
    expect(result.current.page).toBe(3);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.error).toBeNull();
  });

  it('sets the same error message on API non-ok and on network failure', async () => {
    // API non-ok response.
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const first = renderHook(() => useEnviosHistory('', '', '', 1));
    await waitFor(() => {
      expect(first.result.current.error).toBe(
        'Error al cargar el historial de envíos. Intente nuevamente.',
      );
    });
    expect(first.result.current.loading).toBe(false);
    expect(first.result.current.rows).toEqual([]);
    first.unmount();

    // Network-level rejection.
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error('Network down'));
    const second = renderHook(() => useEnviosHistory('', '', '', 1));
    await waitFor(() => {
      expect(second.result.current.error).toBe(
        'Error al cargar el historial de envíos. Intente nuevamente.',
      );
    });
  });

  it('ignores AbortError rejections (param change / unmount races)', async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new DOMException('aborted', 'AbortError')),
    );

    const { result } = renderHook(() => useEnviosHistory('', '', '', 1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeNull();
  });

  it('re-fetches when q changes and when retryNonce changes (params untouched)', async () => {
    mockFetch.mockResolvedValue(okResponse({ success: true, rows: [], total: 0 }));
    const { rerender } = renderHook(
      ({ q, nonce }) => useEnviosHistory(q, '', '', 1, nonce),
      { initialProps: { q: '', nonce: 0 } },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    rerender({ q: 'acme', nonce: 0 });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch.mock.calls[1][0]).toBe('/api/consolidados/envios?q=acme');

    // Reintentar: nonce bump re-fetches WITHOUT altering the params.
    rerender({ q: 'acme', nonce: 1 });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
    expect(mockFetch.mock.calls[2][0]).toBe('/api/consolidados/envios?q=acme');
  });
});
