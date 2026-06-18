'use client';

import { useEffect, useRef, useState } from 'react';
import type { InformeNoCerradoRow, PlantillaRow } from '@/types/informe';
import {
  DEFAULT_EMI_AFI,
  DEFAULT_INC_EXP,
} from '@/features/envio-resultados/infrastructure/informes/constants';

export type PlantillasState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: readonly PlantillaRow[] };

export interface UsePlantillasReturn {
  state: PlantillasState;
  /**
   * Re-arm the hook when the upstream order row changes (e.g. the
   * operator opens a different ficha or `useInformeOrder` re-fetches).
   */
  refetch: () => void;
}

/**
 * Fixed values for the plantillas SP call. These come from the legacy
 * v1 call sites (`InformesMedicosD.cs:28-29`) and live in
 * `informes/constants.ts` so the SP route, the generar payload, and
 * this hook all agree. Lift to a config / context if they ever need
 * to vary.
 */

/**
 * Race-protected fetch of `GET /api/informes/[idAten]/plantillas`.
 *
 * The hook ONLY fires when `order` is non-null (the lookup must have
 * resolved the `numOrd` first). When `order` is null the hook returns
 * `{ kind: 'empty' }` and does NOT issue a fetch — this is the
 * spec-mandated "fetch only when numOrd is non-null" contract.
 *
 * Race protection mirrors `useInformeOrder`:
 *
 * - `requestIdRef` stamps every fetch.
 * - `AbortController` cancels the in-flight request on unmount,
 *   order change, or explicit `refetch()`.
 * - `AbortError` is swallowed silently.
 */
export function usePlantillas(
  idAten: string,
  order: InformeNoCerradoRow | null,
): UsePlantillasReturn {
  const [state, setState] = useState<PlantillasState>(() => {
    if (order === null) return { kind: 'empty' };
    return { kind: 'loading' };
  });
  const [refreshCounter, setRefreshCounter] = useState(0);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (order === null) {
      setState({ kind: 'empty' });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const myId = ++requestIdRef.current;
    setState({ kind: 'loading' });
    /* eslint-enable react-hooks/set-state-in-effect */

    // Snapshot the order fields we need before the async chain so a
    // parent re-render with a new `order` reference cannot race the
    // fetch (the ref-based race protection is what actually drops
    // stale responses; this snapshot is just defensive).
    const codCli = order.codCli;
    const codDCo = order.codDCo;

    // Plantillas need `codCli`; if the SP row has it null we still
    // issue the call and let the route reject (the operator will see
    // the 4xx as an error state, not a silent empty).
    const params = new URLSearchParams({
      codCli: String(codCli ?? ''),
      emiAfi: String(DEFAULT_EMI_AFI),
      incExp: String(DEFAULT_INC_EXP),
    });
    if (codDCo !== undefined && codDCo !== null) {
      params.set('codDCo', String(codDCo));
    }

    const url = `/api/informes/${encodeURIComponent(idAten)}/plantillas?${params.toString()}`;

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PlantillaRow[];
      })
      .then((body) => {
        if (requestIdRef.current !== myId) return;
        const items = Array.isArray(body) ? body : [];
        setState(items.length === 0 ? { kind: 'empty' } : { kind: 'ready', items });
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
    // Depend on the primitive fields of `order` (not the object
    // reference) so the effect does NOT re-run on every parent
    // re-render. The order's content changes when `numOrd`, `codCli`
    // or `codDCo` changes — those are the only fields the URL cares
    // about, so the dependency is both stable and complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAten, order?.numOrd, order?.codCli, order?.codDCo, refreshCounter]);

  const refetch = (): void => {
    setRefreshCounter((c) => c + 1);
  };

  return { state, refetch };
}
