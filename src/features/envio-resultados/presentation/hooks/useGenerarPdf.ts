'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerarPdfRequest, GenerarPdfResponse } from '@/types/informe';

/**
 * Total attempts the hook will make before surfacing the last error
 * (1 initial + 2 retries). Mirrors spec REQ-6.
 */
export const MAX_ATTEMPTS = 3;

/**
 * Linear backoff schedule (ms) — `BACKOFF_MS[i]` is the wait BEFORE
 * attempt `i + 1`. Index 0 = before retry #1 (1s), index 1 = before
 * retry #2 (2s). No wait after the final attempt.
 */
const BACKOFF_MS: readonly number[] = [1_000, 2_000];

export type GenerarPdfStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseGenerarPdfReturn {
  status: GenerarPdfStatus;
  /** Response body of the last SUCCESSFUL invocation, or `null`. */
  result: GenerarPdfResponse | null;
  /** Last surfaced error message (`null` while `status !== 'error'`). */
  lastError: string | null;
  /** 1-based count of the attempt that produced the current state. */
  attempts: number;
  /** Fire a new run. Cancels any in-flight run. */
  run: (request: GenerarPdfRequest) => void;
  /**
   * Re-arm the hook after an error. Resets the status to `'idle'`
   * and clears the error so the operator can try again.
   */
  reset: () => void;
}

/**
 * Hook that owns the POST /generar retry contract. Per spec REQ-6:
 *
 * - 3 total attempts (1 initial + 2 retries) on transient failures
 *   (network error, 5xx, exit code != 0).
 * - 4xx short-circuits — those are validation errors and must not be
 *   retried.
 * - Backoff is linear 1s then 2s.
 * - After the 3rd failure, the hook surfaces the last error to the
 *   pane and stops.
 *
 * The hook is intentionally state-driven (not promise-driven) so the
 * pane can render the loading / success / error branches with
 * ordinary React rendering and tests can assert on `status`.
 */
export function useGenerarPdf(): UseGenerarPdfReturn {
  const [status, setStatus] = useState<GenerarPdfStatus>('idle');
  const [result, setResult] = useState<GenerarPdfResponse | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  // Guards the in-flight run so a second `run()` cancels the first.
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks pending backoff timers so unmount / new run can clear them.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any in-flight run + timer on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  /**
   * Issue a single attempt. Resolves with the response on a 2xx, or
   * throws an `Error` whose `message` carries the operator-facing copy
   * (HTTP code, "abort", or the route's `message` field).
   */
  const attempt = useCallback(
    async (request: GenerarPdfRequest, signal: AbortSignal): Promise<GenerarPdfResponse> => {
      const res = await fetch(`/api/informes/${encodeURIComponent(request.idAten)}/generar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });

      if (res.ok) {
        return (await res.json()) as GenerarPdfResponse;
      }

      // 4xx: deterministic, surface the route's message verbatim.
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        const msg = body.message ?? `HTTP ${res.status}`;
        const err = new Error(msg);
        (err as Error & { isValidation: boolean }).isValidation = true;
        throw err;
      }

      // 5xx (and anything else non-2xx): transient, retryable.
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `HTTP ${res.status}`);
    },
    [],
  );

  const run = useCallback(
    (request: GenerarPdfRequest): void => {
      // Cancel any prior run + scheduled backoff.
      abortRef.current?.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const myId = ++runIdRef.current;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setStatus('loading');
      setResult(null);
      setLastError(null);
      setAttempts(0);

      const sleep = (ms: number): Promise<void> =>
        new Promise<void>((resolve) => {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            resolve();
          }, ms);
        });

      const isAborted = (): boolean =>
        runIdRef.current !== myId || ctrl.signal.aborted;

      (async (): Promise<void> => {
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          if (isAborted()) return;
          setAttempts(i + 1);
          try {
            const body = await attempt(request, ctrl.signal);
            if (isAborted()) return;
            setResult(body);
            setStatus('success');
            setLastError(null);
            return;
          } catch (err) {
            if (isAborted()) return;
            if (err instanceof DOMException && err.name === 'AbortError') return;
            const isValidation =
              err instanceof Error && (err as Error & { isValidation?: boolean }).isValidation === true;
            if (isValidation) {
              // 4xx — short-circuit, no retry.
              setLastError(err instanceof Error ? err.message : String(err));
              setStatus('error');
              return;
            }
            // Transient — log the attempt message for ops triage.
            const msg = err instanceof Error ? err.message : String(err);
            // Last attempt: surface the error and stop.
            if (i === MAX_ATTEMPTS - 1) {
              setLastError(msg);
              setStatus('error');
              return;
            }
            // Schedule the next attempt after the linear backoff.
            await sleep(BACKOFF_MS[i] ?? 0);
            if (isAborted()) return;
          }
        }
      })().catch(() => {
        // Defensive — the inner loop catches every awaited error, so
        // reaching here would mean an unexpected throw escaped. The
        // hook's contract is to never throw, so swallow.
      });
    },
    [attempt],
  );

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    runIdRef.current += 1;
    setStatus('idle');
    setResult(null);
    setLastError(null);
    setAttempts(0);
  }, []);

  return { status, result, lastError, attempts, run, reset };
}
