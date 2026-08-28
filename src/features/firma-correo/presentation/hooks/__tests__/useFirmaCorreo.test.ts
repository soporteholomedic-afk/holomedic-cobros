/**
 * Tests for `useFirmaCorreo` (editor-firmas task 4.1).
 *
 * Spec `envio-resultados` / "Send-Time Signature Composition": `ctx.firma`
 * is composed SERVER-SIDE; this hook only fetches the composed HTML from
 * GET /api/plantillas/firma and exposes it VERBATIM. An empty `firmaHtml`
 * (no saved signature — PR2 API contract) passes through unchanged: the
 * `[Falta configurar firma]` fallback lives ONLY in the send-path token
 * resolver, never duplicated here.
 *
 * fetch is mocked at the global boundary (repo testing rule).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFirmaCorreo } from '../useFirmaCorreo';

const mockFetch = vi.hoisted(() => vi.fn());

const COMPOSED = '<table><tr><td>Dr. Juan Doe</td></tr></table>';

function firmaResponse(firmaHtml: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, firma: null, firmaHtml }),
  } as unknown as Response;
}

describe('useFirmaCorreo', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in loading status with an empty firma while the request is in flight', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useFirmaCorreo());

    expect(result.current.status).toBe('loading');
    expect(result.current.firmaHtml).toBe('');
  });

  it('fetches GET /api/plantillas/firma on mount and exposes the composed firmaHtml verbatim', async () => {
    mockFetch.mockResolvedValue(firmaResponse(COMPOSED));

    const { result } = renderHook(() => useFirmaCorreo());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.firmaHtml).toBe(COMPOSED);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/plantillas/firma');
  });

  it('passes an empty firmaHtml through when the user has no saved signature', async () => {
    mockFetch.mockResolvedValue(firmaResponse(''));

    const { result } = renderHook(() => useFirmaCorreo());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.firmaHtml).toBe('');
  });

  it('exposes error status and an empty firma when the response is not ok (session lost)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'No autenticado' }),
    } as unknown as Response);

    const { result } = renderHook(() => useFirmaCorreo());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.firmaHtml).toBe('');
  });

  it('exposes error status and an empty firma when the transport rejects', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useFirmaCorreo());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.firmaHtml).toBe('');
  });

  it('rejects a malformed body (firmaHtml missing or not a string) instead of trusting it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);

    const { result } = renderHook(() => useFirmaCorreo());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.firmaHtml).toBe('');
  });
});
