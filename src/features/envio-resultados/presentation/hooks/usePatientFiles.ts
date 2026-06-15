'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FileEntry } from '@/features/envio-resultados/domain/ports';

export type { FileEntry };

export interface UsePatientFilesReturn {
  files: FileEntry[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch the file listing for a patient archive folder.
 *
 * Contract (see design.md observation 109 + spec REQ-FL-2):
 *
 * - Empty args short-circuit: any of `ruc === ''`, `dni === ''`,
 *   `idAten === ''` returns `{ files: [], loading: false, error: null }`
 *   and does NOT issue a network request.
 * - While the request is in flight: `loading: true`, `error: null`.
 * - On 200: `files` is the response body, `loading: false`, `error: null`.
 * - 200 with `{ files: [] }` is the empty state (not an error).
 * - On non-2xx OR network throw: `files: []`, `error: Error`, `loading: false`.
 * - `refetch()` reissues the request; results land in the same fields.
 */
export function usePatientFiles(
  ruc: string,
  dni: string,
  idAten: string,
): UsePatientFilesReturn {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    // Empty-args short-circuit (REQ-FL-2): do not fetch.
    // setState calls here are intentional — they reset the hook's
    // local state when the args transition from non-empty to empty.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (ruc === '' || dni === '' || idAten === '') {
      setFiles([]);
      setLoading(false);
      setError(null);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = `/api/files/list?ruc=${encodeURIComponent(ruc)}&dni=${encodeURIComponent(dni)}&idAten=${encodeURIComponent(idAten)}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as { files: FileEntry[] };
      })
      .then((body) => {
        if (cancelled) return;
        setFiles(body.files ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ruc, dni, idAten, reloadKey]);

  return { files, loading, error, refetch };
}
