'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ClienteSiglaSinFicha, EmpresaInactiva, OpcionesInactivas } from '../../application/listarEmpresasInactivas';

interface RespuestaCrm {
  success: boolean;
  filas?: EmpresaInactiva[];
  sinInformacion?: number;
  total?: number;
  totalFuente?: number;
  paginas?: number;
  sectores?: string[];
  error?: string;
}

interface RespuestaSigla {
  success: boolean;
  filas?: ClienteSiglaSinFicha[];
  total?: number;
  totalFuente?: number;
  pagina?: number;
  paginas?: number;
  error?: string;
}

export interface SegmentoCrm {
  filas: EmpresaInactiva[];
  sinInformacion: number;
  total: number;
  totalFuente: number;
  paginas: number;
  sectores: string[];
}

export interface SegmentoSigla {
  filas: ClienteSiglaSinFicha[];
  total: number;
  totalFuente: number;
  paginas: number;
}

export interface EstadoInactivasCompletas {
  crm: SegmentoCrm;
  cargandoCrm: boolean;
  errorCrm: string | null;
  sigla: SegmentoSigla;
  cargandoSigla: boolean;
  errorSigla: string | null;
  /** Refetch of the CRM segment with its current options (retry button). */
  recargarCrm: () => void;
  /** Refetch of the SIGLA segment with its current options (retry button). */
  recargarSigla: () => void;
}

const MENSAJE_CRM = 'No se pudo cargar la lista de empresas inactivas';
const MENSAJE_SIGLA = 'No se pudo cargar los clientes de SIGLA sin ficha.';

/** Serializes options into a query string (empty values are skipped). */
function opcionesAQuery(op: OpcionesInactivas): string {
  const params = new URLSearchParams();
  if (op.q) params.set('q', op.q);
  if (op.sector) params.set('sector', op.sector);
  if (op.estado) params.set('estado', op.estado);
  if (op.mesesMin !== undefined) params.set('mesesMin', String(op.mesesMin));
  if (op.mesesMax !== undefined) params.set('mesesMax', String(op.mesesMax));
  if (op.contacto) params.set('contacto', op.contacto);
  if (op.orden) params.set('orden', op.orden);
  if (op.direccion) params.set('direccion', op.direccion);
  if (op.pagina !== undefined) params.set('pagina', String(op.pagina));
  // Sin el `?` inicial: los call sites ya lo agregan (el CRM lo usa directo y
  // el segmento SIGLA lo concatena tras `?fuente=sigla` — un `?` extra rompería
  // las claves (`&?q=` se parsea como la clave '?q').
  return params.toString();
}

/**
 * Loads BOTH sources of the Inactivas view (feature crm-vista-inactivas,
 * S10/S12/S14-S16), mirroring `useAlertasDia`: retry bumps a key, the effects
 * re-run, every setState happens after the fetch resolves (React 19
 * no-sync-setState-in-effect) and is guarded by the `viva` flag. Options
 * (filters/sort/page) travel serialized into the effect keys: changing any of
 * them refetches exactly that segment. `reloadKey` (bumped by the parent
 * after saving a contact) refreshes both.
 */
export function useInactivasCompletas(
  reloadKey: number,
  opcionesCrm: OpcionesInactivas,
  opcionesSigla: OpcionesInactivas,
): EstadoInactivasCompletas {
  const [crm, setCrm] = useState<SegmentoCrm>({
    filas: [],
    sinInformacion: 0,
    total: 0,
    totalFuente: 0,
    paginas: 1,
    sectores: [],
  });
  const [cargandoCrm, setCargandoCrm] = useState(true);
  const [errorCrm, setErrorCrm] = useState<string | null>(null);
  const [sigla, setSigla] = useState<SegmentoSigla>({ filas: [], total: 0, totalFuente: 0, paginas: 1 });
  const [cargandoSigla, setCargandoSigla] = useState(true);
  const [errorSigla, setErrorSigla] = useState<string | null>(null);
  const [recargaCrm, setRecargaCrm] = useState(0);
  const [recargaSigla, setRecargaSigla] = useState(0);

  const claveCrm = JSON.stringify(opcionesCrm);
  const claveSigla = JSON.stringify(opcionesSigla);

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

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const qs = opcionesAQuery(opcionesCrm);
        const res = await fetch(`/api/crm/empresas/inactivas${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
        const body = (await res.json()) as RespuestaCrm;
        if (!res.ok || !body.success) throw new Error(body.error ?? MENSAJE_CRM);
        if (viva) {
          setCrm({
            filas: body.filas ?? [],
            sinInformacion: body.sinInformacion ?? 0,
            total: body.total ?? 0,
            totalFuente: body.totalFuente ?? 0,
            paginas: body.paginas ?? 1,
            sectores: body.sectores ?? [],
          });
        }
      } catch {
        if (viva) setErrorCrm(MENSAJE_CRM);
      }
      if (viva) setCargandoCrm(false);
    })();
    return () => {
      viva = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, recargaCrm, claveCrm]);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const qs = opcionesAQuery(opcionesSigla);
        const res = await fetch(`/api/crm/empresas/inactivas?fuente=sigla${qs ? `&${qs}` : ''}`, { cache: 'no-store' });
        const body = (await res.json()) as RespuestaSigla;
        if (!res.ok || !body.success) throw new Error(body.error ?? MENSAJE_SIGLA);
        if (viva) {
          setSigla({
            filas: body.filas ?? [],
            total: body.total ?? 0,
            totalFuente: body.totalFuente ?? 0,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, recargaSigla, claveSigla]);

  return {
    crm,
    cargandoCrm,
    errorCrm,
    sigla,
    cargandoSigla,
    errorSigla,
    recargarCrm,
    recargarSigla,
  };
}
