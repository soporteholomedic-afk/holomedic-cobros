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

  it('sets the error message when the API responds non-ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useEnviosHistory('', '', '', 1));

    await waitFor(() => {
      expect(result.current.error).toBe(
        'Error al cargar el historial de envíos. Intente nuevamente.',
      );
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([]);
  });

  it('sets the error message on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useEnviosHistory('', '', '', 1));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
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

  it('re-fetches when q changes', async () => {
    mockFetch.mockResolvedValue(okResponse({ success: true, rows: [], total: 0 }));
    const { rerender } = renderHook(
      ({ q }) => useEnviosHistory(q, '', '', 1),
      { initialProps: { q: '' } },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    rerender({ q: 'acme' });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch.mock.calls[1][0]).toBe('/api/consolidados/envios?q=acme');
  });

  it('re-fetches when retryNonce changes without altering the params', async () => {
    mockFetch.mockResolvedValue(okResponse({ success: true, rows: [], total: 0 }));
    const { rerender } = renderHook(
      ({ nonce }) => useEnviosHistory('', '', '', 1, nonce),
      { initialProps: { nonce: 0 } },
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    rerender({ nonce: 1 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch.mock.calls[1][0]).toBe('/api/consolidados/envios');
  });
});
