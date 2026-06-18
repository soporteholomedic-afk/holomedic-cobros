'use client';

import { useEffect, useRef, useState } from 'react';
import type { InformeNoCerradoRow } from '@/types/informe';

/**
 * State for the order-lookup hook. Mirrors the same orthogonal shape
 * used by `useReadyFiles` and `useFileTree` so callers can render the
 * same skeleton/empty/error/ready branches.
 */
export type InformeOrderState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; row: InformeNoCerradoRow };

export interface UseInformeOrderReturn {
  state: InformeOrderState;
  /**
   * Re-arm the hook. Useful when the operator edits the upstream
   * `fecAte` without changing the (ruc, dni, idAten) triple.
   */
  refetch: () => void;
}

/**
 * Race-protected fetch of `GET /api/informes/[idAten]/lookup`.
 *
 * The lookup drives `SP_SEL_INFORMESNOCERRADOS` and resolves the
 * order metadata (`numOrd`, `codCli`, `codDCo?`, …) that the
 * plantillas and generar routes need. `fecAte` is forwarded as a
 * query string so the SP can scope the query to the same day.
 *
 * Empty-args short-circuit: when any of `idAten === ''` or
 * `fecAte === ''` the hook returns `{ kind: 'empty' }` immediately
 * and does NOT issue a fetch. This is the contract for worker-sourced
 * fichas (no order row → no `fecAte`).
 *
 * Race protection mirrors `useFileTree` / `useReadyFiles`:
 *
 * - A monotonically-increasing `requestIdRef` stamps every fetch.
 * - An `AbortController` cancels the in-flight request on unmount,
 *   identity change, or explicit `refetch()`.
 * - `AbortError` is swallowed silently.
 */
export function useInformeOrder(
  idAten: string,
  fecAte: string,
): UseInformeOrderReturn {
  const [state, setState] = useState<InformeOrderState>(() => {
    if (idAten === '' || fecAte === '') return { kind: 'empty' };
    return { kind: 'loading' };
  });
  const [refreshCounter, setRefreshCounter] = useState(0);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // setState calls here are intentional — they reset the hook's
    // local state when the (idAten, fecAte) identity changes. The
    // reset is the documented behavior of the hook, not a
    // cascading render.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (idAten === '' || fecAte === '') {
      setState({ kind: 'empty' });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const myId = ++requestIdRef.current;
    setState({ kind: 'loading' });
    /* eslint-enable react-hooks/set-state-in-effect */

    const url =
      `/api/informes/${encodeURIComponent(idAten)}/lookup` +
      `?fecAte=${encodeURIComponent(fecAte)}`;

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) {
          return { notFound: true as const };
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as InformeNoCerradoRow;
      })
      .then((body) => {
        if (requestIdRef.current !== myId) return;
        if ('notFound' in body) {
          setState({ kind: 'empty' });
          return;
        }
        setState({ kind: 'ready', row: body });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestIdRef.current !== myId) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      abortRef.current?.abort();
    };
  }, [idAten, fecAte, refreshCounter]);

  const refetch = (): void => {
    setRefreshCounter((c) => c + 1);
  };

  return { state, refetch };
}
