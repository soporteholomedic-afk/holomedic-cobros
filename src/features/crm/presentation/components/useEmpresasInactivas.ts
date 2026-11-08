'use client';

import { useCallback, useEffect, useState } from 'react';

import type { EmpresaInactiva } from '../../application/listarEmpresasInactivas';

interface ListadoResponse {
  success: boolean;
  filas?: EmpresaInactiva[];
  sinInformacion?: number;
  error?: string;
}

export interface EstadoInactivas {
  filas: EmpresaInactiva[];
  /** Clientes that can never reach SIGLA (no RUC); informational count. */
  sinInformacion: number;
  cargando: boolean;
  error: string | null;
  /** Refetch on demand (the retry button). */
  recargar: () => void;
}

const MENSAJE_FALLO = 'No se pudo cargar la lista de empresas inactivas';

/**
 * Loads `GET /api/crm/empresas/inactivas` (live SIGLA bulk lookup) on mount
 * and on explicit retry, mirroring `useAlertasDia`: `recargar` bumps a key
 * and the effect re-runs; every setState happens after the fetch resolves
 * (React 19 no-sync-setState-in-effect) and is guarded by the `viva` flag.
 * The rows arrive already ordered by the endpoint — most abandoned first.
 */
export function useEmpresasInactivas(reloadKey = 0): EstadoInactivas {
  const [filas, setFilas] = useState<EmpresaInactiva[]>([]);
  const [sinInformacion, setSinInformacion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propiaRecarga, setPropiaRecarga] = useState(0);

  const recargar = useCallback((): void => {
    setError(null);
    setCargando(true);
    setPropiaRecarga((k) => k + 1);
  }, []);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const res = await fetch('/api/crm/empresas/inactivas', { cache: 'no-store' });
        const body = (await res.json()) as ListadoResponse;
        if (!res.ok || !body.success) throw new Error(body.error ?? MENSAJE_FALLO);
        if (viva) {
          setFilas(body.filas ?? []);
          setSinInformacion(body.sinInformacion ?? 0);
        }
      } catch (e) {
        if (viva) setError(e instanceof Error ? e.message : MENSAJE_FALLO);
      }
      if (viva) setCargando(false);
    })();
    return () => {
      viva = false;
    };
  }, [propiaRecarga, reloadKey]);

  return { filas, sinInformacion, cargando, error, recargar };
}
