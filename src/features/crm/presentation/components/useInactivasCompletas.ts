'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ClienteSiglaSinFicha, EmpresaInactiva } from '../../application/listarEmpresasInactivas';

interface RespuestaCrm {
  success: boolean;
  filas?: EmpresaInactiva[];
  sinInformacion?: number;
  error?: string;
}

interface RespuestaSigla {
  success: boolean;
  filas?: ClienteSiglaSinFicha[];
  total?: number;
  pagina?: number;
  paginas?: number;
  error?: string;
}

export interface EstadoSigla {
  filas: ClienteSiglaSinFicha[];
  total: number;
  pagina: number;
  paginas: number;
}

export interface EstadoInactivasCompletas {
  /** Segmento "Con ficha en el CRM". */
  filas: EmpresaInactiva[];
  sinInformacion: number;
  cargandoCrm: boolean;
  errorCrm: string | null;
  /** Segmento "Solo en SIGLA" (sin ficha en el CRM). */
  sigla: EstadoSigla;
  cargandoSigla: boolean;
  errorSigla: string | null;
  /** Refetch of the CRM segment on demand (retry button). */
  recargarCrm: () => void;
  /** Refetch of the current SIGLA page on demand (retry button). */
  recargarSigla: () => void;
  /** SIGLA pagination (in-memory paging server-side). */
  irAPaginaSigla: (pagina: number) => void;
}

const MENSAJE_CRM = 'No se pudo cargar la lista de empresas inactivas';
const MENSAJE_SIGLA = 'No se pudo cargar los clientes de SIGLA sin ficha.';

/**
 * Loads BOTH sources of the Inactivas view (feature crm-vista-inactivas,
 * S10/S12): the CRM ficha segment and the SIGLA-only segment (dormant SIGLA
 * clients with no ficha), mirroring `useAlertasDia`: retry bumps a key, the
 * effects re-run, every setState happens after the fetch resolves (React 19
 * no-sync-setState-in-effect) and is guarded by the `viva` flag. `reloadKey`
 * (bumped by the parent after saving a contact) refreshes both sources; the
 * SIGLA segment also refetches when its page changes.
 */
export function useInactivasCompletas(reloadKey = 0): EstadoInactivasCompletas {
  const [filas, setFilas] = useState<EmpresaInactiva[]>([]);
  const [sinInformacion, setSinInformacion] = useState(0);
  const [cargandoCrm, setCargandoCrm] = useState(true);
  const [errorCrm, setErrorCrm] = useState<string | null>(null);
  const [sigla, setSigla] = useState<EstadoSigla>({ filas: [], total: 0, pagina: 1, paginas: 1 });
  const [cargandoSigla, setCargandoSigla] = useState(true);
  const [errorSigla, setErrorSigla] = useState<string | null>(null);
  const [recargaCrm, setRecargaCrm] = useState(0);
  const [recargaSigla, setRecargaSigla] = useState(0);
  const [pagina, setPagina] = useState(1);

  const recargarCrm = useCallback((): void => {
    setErrorCrm(null);
    setCargandoCrm(true);
    setRecargaCrm((k) => k + 1);
  }, []);

  const recargarSigla = useCallback((): void => {
    setErrorSigla(null);
    setCargandoSigla(true);
    setRecargaSigla((k) => k + 1);
  }, []);

  const irAPaginaSigla = useCallback((destino: number): void => {
    setCargandoSigla(true);
    setPagina(destino);
  }, []);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const res = await fetch('/api/crm/empresas/inactivas', { cache: 'no-store' });
        const body = (await res.json()) as RespuestaCrm;
        if (!res.ok || !body.success) throw new Error(body.error ?? MENSAJE_CRM);
        if (viva) {
          setFilas(body.filas ?? []);
          setSinInformacion(body.sinInformacion ?? 0);
        }
      } catch {
        if (viva) setErrorCrm(MENSAJE_CRM);
      }
      if (viva) setCargandoCrm(false);
    })();
    return () => {
      viva = false;
    };
  }, [reloadKey, recargaCrm]);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const res = await fetch(`/api/crm/empresas/inactivas?fuente=sigla&pagina=${pagina}`, { cache: 'no-store' });
        const body = (await res.json()) as RespuestaSigla;
        if (!res.ok || !body.success) throw new Error(body.error ?? MENSAJE_SIGLA);
        if (viva) {
          setSigla({
            filas: body.filas ?? [],
            total: body.total ?? 0,
            pagina: body.pagina ?? pagina,
            paginas: body.paginas ?? 1,
          });
        }
      } catch {
        if (viva) setErrorSigla(MENSAJE_SIGLA);
      }
      if (viva) setCargandoSigla(false);
    })();
    return () => {
      viva = false;
    };
  }, [reloadKey, recargaSigla, pagina]);

  return {
    filas,
    sinInformacion,
    cargandoCrm,
    errorCrm,
    sigla,
    cargandoSigla,
    errorSigla,
    recargarCrm,
    recargarSigla,
    irAPaginaSigla,
  };
}
