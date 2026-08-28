'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * `useLookup` — generic client hook for the filter-panel lookups
 * (design D3): `GET /api/valoraciones/lookups/{tipo}?…`.
 *
 * - `habilitado: false` keeps the hook idle with empty items (no fetch):
 *   used for the `q >= 2` autocomplete rule and the destinos-without-a-
 *   client gating (spec Q-R4).
 * - Param changes are debounced (typical autocomplete usage) and the
 *   serialized `tipo + params` key drives refetches, so callers may pass
 *   an inline object without retriggering on every render.
 * - Stale responses are discarded via request ids (useCobranzaHistorial
 *   precedent); the pending debounce timer is cleared on change/unmount.
 */
export const LOOKUP_DEBOUNCE_MS = 250;

export type LookupTipo =
  | 'clientes'
  | 'pacientes'
  | 'destinos'
  | 'tipos-trabajador'
  | 'sedes';

export interface UseLookupResult<T> {
  items: T[];
  cargando: boolean;
  error: string | null;
}

export interface UseLookupOptions {
  /** When `false` the hook stays idle with empty items (no fetch). */
  habilitado?: boolean;
  debounceMs?: number;
}

export function useLookup<T>(
  tipo: LookupTipo,
  params: Record<string, string> = {},
  opciones: UseLookupOptions = {},
): UseLookupResult<T> {
  const { habilitado = true, debounceMs = LOOKUP_DEBOUNCE_MS } = opciones;
  const [items, setItems] = useState<T[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Stable value key: refetch only when tipo/params actually change.
  const clave = JSON.stringify([tipo, params]);

  useEffect(() => {
    // The setState calls below report the fetch lifecycle — the
    // documented contract of this hook (useCobranzaHistorial precedent).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!habilitado) {
      requestIdRef.current += 1; // invalidate any in-flight response
      setItems([]);
      setCargando(false);
      setError(null);
      return;
    }

    const id = ++requestIdRef.current;
    setCargando(true);
    setError(null);

    const timer = setTimeout(() => {
      // Reconstruct params from the key (keeps the effect dep list exact).
      const [, queryObj] = JSON.parse(clave) as [string, Record<string, string>];
      const query = new URLSearchParams(queryObj).toString();
      void (async () => {
        try {
          const res = await fetch(
            `/api/valoraciones/lookups/${tipo}${query ? `?${query}` : ''}`,
          );
          if (id !== requestIdRef.current) return;
          const json: unknown = await res.json().catch(() => ({}));
          if (id !== requestIdRef.current) return;

          if (!res.ok) {
            const apiError = (json as { error?: unknown }).error;
            setError(
              typeof apiError === 'string' ? apiError : `Error del servidor (${res.status})`,
            );
            setItems([]);
            return;
          }
          const resultados = (json as { resultados?: unknown }).resultados;
          if (!Array.isArray(resultados)) {
            setError('Respuesta inesperada del servidor');
            setItems([]);
            return;
          }
          setItems(resultados as T[]);
        } catch {
          if (id !== requestIdRef.current) return;
          setError('Error de conexión');
          setItems([]);
        } finally {
          if (id === requestIdRef.current) setCargando(false);
        }
      })();
    }, debounceMs);

    return () => clearTimeout(timer);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [clave, habilitado, debounceMs, tipo]);

  return { items, cargando, error };
}
