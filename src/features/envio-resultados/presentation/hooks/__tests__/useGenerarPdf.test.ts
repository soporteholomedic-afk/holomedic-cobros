import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerarPdfRequest, GenerarPdfResponse } from '@/types/informe';
import { MAX_ATTEMPTS } from '../useGenerarPdf';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validRequest(): GenerarPdfRequest {
  return {
    idAten: '012110021',
    codEmp: 1,
    codSed: 1,
    codTCl: 2,
    numOrd: 100200,
    codCli: 3331,
    emiAfi: 1,
    incExp: 0,
    codDCo: 76,
    ruc: '20123456789',
    dni: '12345678',
    user: 'soporte',
    pass: 'soporte',
    idePmeList: [39053, 39056],
  };
}

function okBody(): GenerarPdfResponse {
  return {
    manifest: [
      { idePMe: 39053, arcPla: 'exa_lab', file: '...pdf', status: 'success' },
      { idePMe: 39056, arcPla: 'exa_aud', file: '...pdf', status: 'success' },
    ],
    summary: { generated: 2, failed: 0, skipped: 0, exitCode: 0, retries: 0 },
  };
}

describe('useGenerarPdf', () => {
  it('exposes an idle initial state', async () => {
    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.lastError).toBeNull();
    expect(result.current.attempts).toBe(0);
  });

  it('POSTs to /api/informes/[idAten]/generar with the request body JSON-encoded', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, okBody()));

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/informes/012110021/generar');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(validRequest());
  });

  it('transitions to success and surfaces the manifest on a 2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(200, okBody()));

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
      await Promise.resolve();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(okBody());
    expect(result.current.attempts).toBe(1);
  });

  it('short-circuits on a 4xx response (no retry, error surfaced immediately)', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(
      makeJsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Debe seleccionar al menos un examen.' }),
    );

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.lastError).toMatch(/al menos un examen/);
    // Only one attempt — no retries on validation 4xx.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // No backoff timer is set; advancing time should not fire another attempt.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 attempts on 5xx with linear 1s/2s backoff', async () => {
    vi.useFakeTimers();
    // Build a FRESH Response on every fetch call — a Response's body
    // stream is consumed by the first `.json()` read, so reusing the
    // same Response across the 3 attempts would make attempts 2 and 3
    // see an empty body and fall back to the "HTTP 502" message.
    mockFetch.mockImplementation(
      () =>
        Promise.resolve(
          makeJsonResponse(502, {
            code: 'UNC_UNREACHABLE',
            message: 'No se puede acceder a la ruta',
          }),
        ),
    );

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
    });
    // First attempt fires synchronously after `run()` returns control.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Advance the 1s backoff between attempt 1 and 2.
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.attempts).toBe(2);

    // Advance the 2s backoff between attempt 2 and 3.
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.attempts).toBe(3);

    // After the 3rd failure the hook gives up — no more attempts.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(result.current.status).toBe('error');
    expect(result.current.lastError).toMatch(/No se puede acceder/);
  });

  it('resolves to success when an early 5xx is followed by a 2xx', async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(502, { code: 'UNC_UNREACHABLE' }))
      .mockResolvedValueOnce(makeJsonResponse(502, { code: 'UNC_UNREACHABLE' }))
      .mockResolvedValueOnce(makeJsonResponse(200, okBody()));

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(okBody());
  });

  it('retries on a network throw (treated as transient)', async () => {
    vi.useFakeTimers();
    mockFetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(makeJsonResponse(200, okBody()));

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('success');
  });

  it('reset() returns the hook to the idle state', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse(400, { code: 'VALIDATION_ERROR', message: 'fail' }),
    );

    const { useGenerarPdf } = await import('../useGenerarPdf');
    const { result } = renderHook(() => useGenerarPdf());

    await act(async () => {
      result.current.run(validRequest());
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.lastError).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.attempts).toBe(0);
  });
});
