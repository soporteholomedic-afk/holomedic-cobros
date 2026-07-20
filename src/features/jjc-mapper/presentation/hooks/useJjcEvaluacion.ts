'use client';

import { useReducer, useMemo, useCallback } from 'react';
import type { LesionType, Fototipo, LesionPoint } from '@/types/jjc';
import { FOTOTIPO_VALUES } from '@/features/jjc-mapper/domain/entities';

// ---- Types ----

export interface JjcFormState {
  fechaEvaluacion: string;       // YYYY-MM-DD
  lugar: 'HOLOMEDIC';             // always locked
  fototipo: Fototipo | null;
  observaciones: string;         // ≤ 500
}

export type ActiveTool = LesionType | 'delete';

export interface JjcEvaluacionState {
  form: JjcFormState;
  points: LesionPoint[];
  activeTool: ActiveTool;
}

export type JjcEvaluacionAction =
  | { type: 'SET_FECHA'; fecha: string }
  | { type: 'SET_FOTOTIPO'; fototipo: Fototipo }
  | { type: 'SET_OBSERVACIONES'; text: string }
  | { type: 'SET_ACTIVE_TOOL'; tool: ActiveTool }
  | { type: 'ADD_POINT'; point: LesionPoint }
  | { type: 'REMOVE_POINT'; id: string }
  | { type: 'RESET' };

// ---- Helpers ----

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Initial state ----

export function initialJjcState(): JjcEvaluacionState {
  return {
    form: {
      fechaEvaluacion: todayStr(),
      lugar: 'HOLOMEDIC',
      fototipo: null,
      observaciones: '',
    },
    points: [],
    activeTool: 'P',
  };
}

// ---- Reducer ----

export function jjcReducer(
  state: JjcEvaluacionState,
  action: JjcEvaluacionAction,
): JjcEvaluacionState {
  switch (action.type) {
    case 'SET_FECHA': {
      // Validate ≤ today — no future dates
      if (action.fecha > todayStr()) return state;
      return { ...state, form: { ...state.form, fechaEvaluacion: action.fecha } };
    }

    case 'SET_FOTOTIPO': {
      if (!(FOTOTIPO_VALUES as readonly string[]).includes(action.fototipo)) return state;
      return { ...state, form: { ...state.form, fototipo: action.fototipo } };
    }

    case 'SET_OBSERVACIONES': {
      const text = action.text.slice(0, 500);
      return { ...state, form: { ...state.form, observaciones: text } };
    }

    case 'SET_ACTIVE_TOOL': {
      return { ...state, activeTool: action.tool };
    }

    case 'ADD_POINT': {
      return { ...state, points: [...state.points, action.point] };
    }

    case 'REMOVE_POINT': {
      return {
        ...state,
        points: state.points.filter((p) => p.id !== action.id),
      };
    }

    case 'RESET': {
      return initialJjcState();
    }

    default:
      return state;
  }
}

// ---- Selectors ----

export function countersByType(points: LesionPoint[]): Record<LesionType, number> {
  return {
    P: points.filter((p) => p.type === 'P').length,
    L: points.filter((p) => p.type === 'L').length,
    M: points.filter((p) => p.type === 'M').length,
    C: points.filter((p) => p.type === 'C').length,
  };
}

// ---- Hook ----

export interface UseJjcEvaluacionResult {
  state: JjcEvaluacionState;
  counters: Record<LesionType, number>;
  setFecha: (fecha: string) => void;
  setFototipo: (fototipo: Fototipo) => void;
  setObservaciones: (text: string) => void;
  setActiveTool: (tool: ActiveTool) => void;
  addPoint: (point: LesionPoint) => void;
  removePoint: (id: string) => void;
  reset: () => void;
}

export function useJjcEvaluacion(
  initialState?: JjcEvaluacionState,
): UseJjcEvaluacionResult {
  const [state, dispatch] = useReducer(
    jjcReducer,
    initialState ?? initialJjcState(),
  );

  const counters = useMemo(() => countersByType(state.points), [state.points]);

  const setFecha = useCallback((fecha: string) => dispatch({ type: 'SET_FECHA', fecha }), []);
  const setFototipo = useCallback((fototipo: Fototipo) => dispatch({ type: 'SET_FOTOTIPO', fototipo }), []);
  const setObservaciones = useCallback((text: string) => dispatch({ type: 'SET_OBSERVACIONES', text }), []);
  const setActiveTool = useCallback((tool: ActiveTool) => dispatch({ type: 'SET_ACTIVE_TOOL', tool }), []);
  const addPoint = useCallback((point: LesionPoint) => dispatch({ type: 'ADD_POINT', point }), []);
  const removePoint = useCallback((id: string) => dispatch({ type: 'REMOVE_POINT', id }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    state,
    counters,
    setFecha,
    setFototipo,
    setObservaciones,
    setActiveTool,
    addPoint,
    removePoint,
    reset,
  };
}
