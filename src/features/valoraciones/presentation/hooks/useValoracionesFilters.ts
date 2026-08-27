'use client';

import { useCallback, useReducer } from 'react';

import type { CodigoMoneda, ValoracionesFilter } from '../../domain/entities';
import { hoyIso } from '../helpers/format';

/**
 * UI state for the 11-filter panel mirroring SIGLA's `RptFacturacionForm`
 * (REQ-03 Q-R5). Extends the API filter with display labels for the
 * autocompletes and the `consolidado` flag — which slice 1 keeps
 * permanently disabled (checkbox rendered disabled; enabled in slice 2).
 */
export interface ValoracionesFilterState {
  /** Periodo (required, `YYYY-MM-DD`, defaults today). */
  fecIni: string;
  fecFin: string;
  /** 1 = SOLES, 2 = DOLARES. */
  codMon: CodigoMoneda;
  /** Tri-state: `null` Todos, `1` Facturados, `0` No Facturados (default). */
  indFac: 0 | 1 | null;
  /** Date mode: `false` FecAte, `true` FecSTA. */
  inFsta: boolean;
  /** Slice 1: always `false` (checkbox disabled). */
  consolidado: boolean;
  codCli?: number;
  cliNombre?: string;
  codCfa?: number;
  cfaNombre?: string;
  codDes?: number;
  codPac?: number;
  pacNombre?: string;
  codSed?: number;
  tipTra?: number;
}

export type ValoracionesFilterAction =
  | { type: 'SET_PERIODO'; fecIni?: string; fecFin?: string }
  | { type: 'SET_MONEDA'; codMon: CodigoMoneda }
  | { type: 'SET_IND_FAC'; indFac: 0 | 1 | null }
  | { type: 'SET_MODO_FECHA'; inFsta: boolean }
  /** `codCli` undefined clears the client — both reset the destino (spec Q-R5). */
  | { type: 'SET_CLIENTE'; codCli?: number; nombre?: string }
  | { type: 'SET_FACTURAR_A'; codCfa?: number; nombre?: string }
  | { type: 'SET_DESTINO'; codDes?: number }
  | { type: 'SET_PACIENTE'; codPac?: number; nombre?: string }
  | { type: 'SET_SEDE'; codSed?: number }
  | { type: 'SET_TIPO_TRABAJADOR'; tipTra?: number }
  | { type: 'LIMPIAR' };

function defaults(): ValoracionesFilterState {
  const hoy = hoyIso();
  return {
    fecIni: hoy,
    fecFin: hoy,
    codMon: 1,
    indFac: 0,
    inFsta: false,
    consolidado: false,
  };
}

function reducer(
  state: ValoracionesFilterState,
  action: ValoracionesFilterAction,
): ValoracionesFilterState {
  switch (action.type) {
    case 'SET_PERIODO':
      return {
        ...state,
        fecIni: action.fecIni ?? state.fecIni,
        fecFin: action.fecFin ?? state.fecFin,
      };
    case 'SET_MONEDA':
      return { ...state, codMon: action.codMon };
    case 'SET_IND_FAC':
      return { ...state, indFac: action.indFac };
    case 'SET_MODO_FECHA':
      return { ...state, inFsta: action.inFsta };
    case 'SET_CLIENTE':
      // Selecting or clearing a client invalidates the current destino
      // (destinos are per-client) — reset it in the same transition.
      return {
        ...state,
        codCli: action.codCli,
        cliNombre: action.codCli === undefined ? undefined : (action.nombre ?? ''),
        codDes: undefined,
      };
    case 'SET_FACTURAR_A':
      return {
        ...state,
        codCfa: action.codCfa,
        cfaNombre: action.codCfa === undefined ? undefined : (action.nombre ?? ''),
      };
    case 'SET_DESTINO':
      return { ...state, codDes: action.codDes };
    case 'SET_PACIENTE':
      return {
        ...state,
        codPac: action.codPac,
        pacNombre: action.codPac === undefined ? undefined : (action.nombre ?? ''),
      };
    case 'SET_SEDE':
      return { ...state, codSed: action.codSed };
    case 'SET_TIPO_TRABAJADOR':
      return { ...state, tipTra: action.tipTra };
    case 'LIMPIAR':
      return defaults();
    default:
      return state;
  }
}

/** Derive the API filter: drops labels and `consolidado`, omits absent ids. */
export function toFiltro(state: ValoracionesFilterState): ValoracionesFilter {
  return {
    fecIni: state.fecIni,
    fecFin: state.fecFin,
    codMon: state.codMon,
    indFac: state.indFac,
    inFsta: state.inFsta,
    ...(state.codCli !== undefined ? { codCli: state.codCli } : {}),
    ...(state.codCfa !== undefined ? { codCfa: state.codCfa } : {}),
    ...(state.codDes !== undefined ? { codDes: state.codDes } : {}),
    ...(state.codPac !== undefined ? { codPac: state.codPac } : {}),
    ...(state.codSed !== undefined ? { codSed: state.codSed } : {}),
    ...(state.tipTra !== undefined ? { tipTra: state.tipTra } : {}),
  };
}

export interface UseValoracionesFiltersResult {
  filtros: ValoracionesFilterState;
  dispatch: React.Dispatch<ValoracionesFilterAction>;
  limpiar: () => void;
}

export function useValoracionesFilters(): UseValoracionesFiltersResult {
  const [filtros, dispatch] = useReducer(reducer, undefined, defaults);
  const limpiar = useCallback(() => dispatch({ type: 'LIMPIAR' }), []);
  return { filtros, dispatch, limpiar };
}
