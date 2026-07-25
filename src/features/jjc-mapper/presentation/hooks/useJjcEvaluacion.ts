'use client';

import { useReducer, useMemo, useCallback } from 'react';
import type { LesionType, Fototipo, Fotoprotector, LesionPoint, SiNo, CuestionarioPiel, PreguntaBase, PreguntaConFecha } from '@/types/jjc';
import { FOTOTIPO_VALUES, FOTOPROTECTOR_POR_FOTOTIPO, FOTOPROTECTOR_VALUES } from '@/features/jjc-mapper/domain/entities';

// ---- Types ----

export type PreguntaSeccion1 = Exclude<keyof CuestionarioPiel, 'describaPositivo' | 'lesionDermatopatia' | 'evaluacionDermatologo'>;

export interface JjcFormState {
  fechaEvaluacion: string;       // YYYY-MM-DD
  lugar: 'HOLOMEDIC';             // always locked
  fototipo: Fototipo | null;
  fotoprotector: Fotoprotector | null;
  observaciones: string;         // ≤ 500
}

export type ActiveTool = LesionType | 'delete';

export interface JjcEvaluacionState {
  form: JjcFormState;
  points: LesionPoint[];
  activeTool: ActiveTool;
  preguntas: CuestionarioPiel;
}

export type JjcEvaluacionAction =
  | { type: 'SET_FECHA'; fecha: string }
  | { type: 'SET_FOTOTIPO'; fototipo: Fototipo }
  | { type: 'SET_FOTOPROTECTOR'; fotoprotector: Fotoprotector }
  | { type: 'SET_OBSERVACIONES'; text: string }
  | { type: 'SET_ACTIVE_TOOL'; tool: ActiveTool }
  | { type: 'ADD_POINT'; point: LesionPoint }
  | { type: 'REMOVE_POINT'; id: string }
  | { type: 'RESET' }
  | { type: 'SET_PREGUNTA_SI_NO'; key: PreguntaSeccion1; value: SiNo | null }
  | { type: 'SET_PREGUNTA_DETALLE'; key: PreguntaSeccion1; value: string }
  | { type: 'SET_FECHA_LESION'; value: string }
  | { type: 'SET_SI_NO_SECCION2'; key: 'lesionDermatopatia' | 'evaluacionDermatologo'; value: SiNo | null }
  | { type: 'SET_DESCRIBA'; value: string }
  | { type: 'SET_PREGUNTAS'; preguntas: CuestionarioPiel };

// ---- Helpers ----

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Initial state ----

export function initialCuestionarioPiel(): CuestionarioPiel {
  return {
    sufreEnfermedadesPiel: { respuesta: null, detalle: '' },
    tieneLesionActual: { respuesta: null, detalle: '', fecha: '' },
    cambioColoracion: { respuesta: null, detalle: '' },
    lesionesRepiten: { respuesta: null, detalle: '' },
    enrojecimiento: { respuesta: null, detalle: '' },
    comezon: { respuesta: null, detalle: '' },
    hinchazon: { respuesta: null, detalle: '' },
    rinitisAsma: { respuesta: null, detalle: '' },
    usaEPP: { respuesta: null, detalle: '' },
    cambiosUnas: { respuesta: null, detalle: '' },
    tomaMedicacion: { respuesta: null, detalle: '' },
    describaPositivo: '',
    lesionDermatopatia: null,
    evaluacionDermatologo: null,
  };
}

export function initialJjcState(): JjcEvaluacionState {
  return {
    form: {
      fechaEvaluacion: todayStr(),
      lugar: 'HOLOMEDIC',
      fototipo: null,
      fotoprotector: null,
      observaciones: '',
    },
    points: [],
    activeTool: 'P',
    preguntas: initialCuestionarioPiel(),
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
      const fotoprotector = FOTOPROTECTOR_POR_FOTOTIPO[action.fototipo];
      return { ...state, form: { ...state.form, fototipo: action.fototipo, fotoprotector } };
    }

    case 'SET_FOTOPROTECTOR': {
      if (!(FOTOPROTECTOR_VALUES as readonly string[]).includes(action.fotoprotector)) return state;
      return { ...state, form: { ...state.form, fotoprotector: action.fotoprotector } };
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

    case 'SET_PREGUNTA_SI_NO': {
      const prev = state.preguntas[action.key] as PreguntaBase;
      return {
        ...state,
        preguntas: {
          ...state.preguntas,
          [action.key]: { ...prev, respuesta: action.value },
        },
      };
    }

    case 'SET_PREGUNTA_DETALLE': {
      const prev = state.preguntas[action.key] as PreguntaBase;
      return {
        ...state,
        preguntas: {
          ...state.preguntas,
          [action.key]: { ...prev, detalle: action.value },
        },
      };
    }

    case 'SET_FECHA_LESION': {
      return {
        ...state,
        preguntas: {
          ...state.preguntas,
          tieneLesionActual: { ...state.preguntas.tieneLesionActual, fecha: action.value },
        },
      };
    }

    case 'SET_SI_NO_SECCION2': {
      return {
        ...state,
        preguntas: {
          ...state.preguntas,
          [action.key]: action.value,
        },
      };
    }

    case 'SET_DESCRIBA': {
      return {
        ...state,
        preguntas: {
          ...state.preguntas,
          describaPositivo: action.value,
        },
      };
    }

    case 'SET_PREGUNTAS': {
      return { ...state, preguntas: action.preguntas };
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
    O: points.filter((p) => p.type === 'O').length,
  };
}

// ---- Hook ----

export interface UseJjcEvaluacionResult {
  state: JjcEvaluacionState;
  counters: Record<LesionType, number>;
  setFecha: (fecha: string) => void;
  setFototipo: (fototipo: Fototipo) => void;
  setFotoprotector: (fotoprotector: Fotoprotector) => void;
  setObservaciones: (text: string) => void;
  setActiveTool: (tool: ActiveTool) => void;
  addPoint: (point: LesionPoint) => void;
  removePoint: (id: string) => void;
  reset: () => void;
  setPreguntaSiNo: (key: PreguntaSeccion1, value: SiNo | null) => void;
  setPreguntaDetalle: (key: PreguntaSeccion1, value: string) => void;
  setFechaLesion: (value: string) => void;
  setSiNoSeccion2: (key: 'lesionDermatopatia' | 'evaluacionDermatologo', value: SiNo | null) => void;
  setDescriba: (value: string) => void;
  setPreguntas: (preguntas: CuestionarioPiel) => void;
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
  const setFotoprotector = useCallback((fotoprotector: Fotoprotector) => dispatch({ type: 'SET_FOTOPROTECTOR', fotoprotector }), []);
  const setObservaciones = useCallback((text: string) => dispatch({ type: 'SET_OBSERVACIONES', text }), []);
  const setActiveTool = useCallback((tool: ActiveTool) => dispatch({ type: 'SET_ACTIVE_TOOL', tool }), []);
  const addPoint = useCallback((point: LesionPoint) => dispatch({ type: 'ADD_POINT', point }), []);
  const removePoint = useCallback((id: string) => dispatch({ type: 'REMOVE_POINT', id }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const setPreguntaSiNo = useCallback((key: PreguntaSeccion1, value: SiNo | null) => dispatch({ type: 'SET_PREGUNTA_SI_NO', key, value }), []);
  const setPreguntaDetalle = useCallback((key: PreguntaSeccion1, value: string) => dispatch({ type: 'SET_PREGUNTA_DETALLE', key, value }), []);
  const setFechaLesion = useCallback((value: string) => dispatch({ type: 'SET_FECHA_LESION', value }), []);
  const setSiNoSeccion2 = useCallback((key: 'lesionDermatopatia' | 'evaluacionDermatologo', value: SiNo | null) => dispatch({ type: 'SET_SI_NO_SECCION2', key, value }), []);
  const setDescriba = useCallback((value: string) => dispatch({ type: 'SET_DESCRIBA', value }), []);
  const setPreguntas = useCallback((preguntas: CuestionarioPiel) => dispatch({ type: 'SET_PREGUNTAS', preguntas }), []);

  return {
    state,
    counters,
    setFecha,
    setFototipo,
    setFotoprotector,
    setObservaciones,
    setActiveTool,
    addPoint,
    removePoint,
    reset,
    setPreguntaSiNo,
    setPreguntaDetalle,
    setFechaLesion,
    setSiNoSeccion2,
    setDescriba,
    setPreguntas,
  };
}
