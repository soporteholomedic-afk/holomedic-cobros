'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { agruparPorEmpresa } from '../../domain/agrupacion';
import { ESTADOS_EMPRESA } from '../../domain/estado';
import type {
  CodigoMoneda,
  EmpresaGrupo,
  RepFacturacion,
  ValoracionesFilter,
} from '../../domain/entities';

/**
 * `useValoraciones` — client hook owning the valoraciones query (REQ-03
 * Q-R3/Q-R6). Components never call fetch directly: they invoke
 * `buscar(filtro)` and render the returned groups.
 *
 * Groups are DERIVED (`agruparPorEmpresa` with the query's `codMon`) —
 * never stored — so the moneda-aware amounts/symbols always match the
 * executed query. Stale responses are discarded via monotonically
 * increasing request ids; the in-flight request is aborted when a new
 * one supersedes it or the component unmounts.
 */
export type ValoracionesStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseValoracionesResult {
  grupos: EmpresaGrupo[];
  status: ValoracionesStatus;
  error: string | null;
  /** Moneda of the last successful query (drives amount columns). */
  moneda: CodigoMoneda | null;
  totalRegistros: number;
  buscar: (filtro: ValoracionesFilter) => void;
}

/** Build the `/api/valoraciones/sigla` query string from the filter. */
export function buildValoracionesQuery(filtro: ValoracionesFilter): string {
  const params = new URLSearchParams({
    fecIni: filtro.fecIni,
    fecFin: filtro.fecFin,
    codMon: String(filtro.codMon),
    indFac: filtro.indFac === null ? 'null' : String(filtro.indFac),
    inFsta: String(filtro.inFsta),
  });
  const ids: Array<[string, number | undefined]> = [
    ['codCli', filtro.codCli],
    ['codCfa', filtro.codCfa],
    ['codDes', filtro.codDes],
    ['codPac', filtro.codPac],
    ['codSed', filtro.codSed],
    ['tipTra', filtro.tipTra],
  ];
  for (const [name, value] of ids) {
    if (value !== undefined && value > 0) params.set(name, String(value));
  }
  return params.toString();
}

/** Light shape guard: our route contract (row mapped server-side). */
function esListaRepFacturacion(v: unknown): v is RepFacturacion[] {
  if (!Array.isArray(v)) return false;
  return v.every((row) => {
    if (typeof row !== 'object' || row === null) return false;
    const r = row as Record<string, unknown>;
    return (
      typeof r.CodMon === 'number' &&
      typeof r.Pacien === 'string' &&
      typeof r.VVtaMN === 'number' &&
      typeof r.VVtaMO === 'number' &&
      typeof r.EstCob === 'string' &&
      (ESTADOS_EMPRESA as readonly string[]).includes(r.EstCob)
    );
  });
}

export function useValoraciones(): UseValoracionesResult {
  const [rows, setRows] = useState<RepFacturacion[]>([]);
  const [moneda, setMoneda] = useState<CodigoMoneda | null>(null);
  const [status, setStatus] = useState<ValoracionesStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Abort the in-flight request on unmount (buscar aborts the previous one).
  useEffect(() => () => abortRef.current?.abort(), []);

  const buscar = useCallback((filtro: ValoracionesFilter): void => {
    const id = ++requestIdRef.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/valoraciones/sigla?${buildValoracionesQuery(filtro)}`,
          { signal: ctrl.signal },
        );
        if (id !== requestIdRef.current) return; // superseded
        const json: unknown = await res.json().catch(() => ({}));
        if (id !== requestIdRef.current) return;

        if (!res.ok) {
          const apiError = (json as { error?: unknown }).error;
          setStatus('error');
          setError(
            typeof apiError === 'string' ? apiError : `Error del servidor (${res.status})`,
          );
          setRows([]);
          setMoneda(null);
          return;
        }

        const resultados = (json as { resultados?: unknown }).resultados;
        if (!esListaRepFacturacion(resultados)) {
          setStatus('error');
          setError('Respuesta inesperada del servidor');
          setRows([]);
          setMoneda(null);
          return;
        }

        setStatus('ready');
        setRows(resultados);
        setMoneda(filtro.codMon);
      } catch (err: unknown) {
        if (ctrl.signal.aborted) return; // superseded or unmount
        setStatus('error');
        setError(err instanceof TypeError ? 'Error de conexión' : String(err));
        setRows([]);
        setMoneda(null);
      }
    })();
  }, []);

  const grupos = useMemo(
    () => (moneda === null ? [] : agruparPorEmpresa(rows, moneda)),
    [rows, moneda],
  );

  return { grupos, status, error, moneda, totalRegistros: rows.length, buscar };
}
