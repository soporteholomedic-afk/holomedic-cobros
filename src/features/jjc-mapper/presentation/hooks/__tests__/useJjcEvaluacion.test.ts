import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useJjcEvaluacion,
  jjcReducer,
  initialJjcState,
  initialCuestionarioPiel,
  countersByType,
  type JjcEvaluacionState,
} from '../useJjcEvaluacion';
import type { LesionPoint } from '@/types/jjc';

// ── Reducer unit tests (pure, no React) ──

describe('jjcReducer', () => {
  it('initial state has fecha = today, lugar = HOLOMEDIC, fototipo = null', () => {
    const state = initialJjcState();
    expect(state.form.lugar).toBe('HOLOMEDIC');
    expect(state.form.fototipo).toBeNull();
    expect(state.form.observaciones).toBe('');
    expect(state.form.fechaEvaluacion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.points).toEqual([]);
    expect(state.activeTool).toBe('P');
  });

  it('SET_FECHA rejects future dates', () => {
    const state = initialJjcState();
    const future = '2099-12-31';
    const next = jjcReducer(state, { type: 'SET_FECHA', fecha: future });
    expect(next.form.fechaEvaluacion).toBe(state.form.fechaEvaluacion);
  });

  it('SET_FECHA accepts today', () => {
    const state = initialJjcState();
    const today = state.form.fechaEvaluacion;
    const next = jjcReducer(state, { type: 'SET_FECHA', fecha: today });
    expect(next.form.fechaEvaluacion).toBe(today);
  });

  it('SET_OBSERVACIONES caps at 500 chars', () => {
    const state = initialJjcState();
    const long = 'a'.repeat(600);
    const next = jjcReducer(state, { type: 'SET_OBSERVACIONES', text: long });
    expect(next.form.observaciones.length).toBe(500);
  });

  it('SET_FOTOTIPO sets the fototipo', () => {
    const state = initialJjcState();
    const next = jjcReducer(state, { type: 'SET_FOTOTIPO', fototipo: 'III-IV' });
    expect(next.form.fototipo).toBe('III-IV');
  });

  it('SET_ACTIVE_TOOL switches tool', () => {
    const state = initialJjcState();
    expect(state.activeTool).toBe('P');
    const next = jjcReducer(state, { type: 'SET_ACTIVE_TOOL', tool: 'delete' });
    expect(next.activeTool).toBe('delete');
  });

  it('ADD_POINT appends a point', () => {
    const state = initialJjcState();
    const point: LesionPoint = { id: 'p1', type: 'M', x: 0.5, y: 0.5 };
    const next = jjcReducer(state, { type: 'ADD_POINT', point });
    expect(next.points).toHaveLength(1);
    expect(next.points[0]).toEqual(point);
  });

  it('REMOVE_POINT removes the point by id', () => {
    const point1: LesionPoint = { id: 'p1', type: 'P', x: 0.5, y: 0.5 };
    const point2: LesionPoint = { id: 'p2', type: 'L', x: 0.3, y: 0.7 };
    const state: JjcEvaluacionState = { ...initialJjcState(), points: [point1, point2] };
    const next = jjcReducer(state, { type: 'REMOVE_POINT', id: 'p1' });
    expect(next.points).toHaveLength(1);
    expect(next.points[0].id).toBe('p2');
  });

  it('REMOVE_POINT is a no-op for unknown id', () => {
    const point: LesionPoint = { id: 'p1', type: 'C', x: 0.5, y: 0.5 };
    const state: JjcEvaluacionState = { ...initialJjcState(), points: [point] };
    const next = jjcReducer(state, { type: 'REMOVE_POINT', id: 'p999' });
    expect(next.points).toHaveLength(1);
  });

  it('RESET returns initial state', () => {
    const state: JjcEvaluacionState = {
      form: {
        fechaEvaluacion: '2026-01-01',
        lugar: 'HOLOMEDIC',
        fototipo: 'V-VI',
        observaciones: 'test',
      },
      points: [{ id: 'p1', type: 'P', x: 0.5, y: 0.5 }],
      activeTool: 'delete',
      preguntas: initialCuestionarioPiel(),
    };
    const next = jjcReducer(state, { type: 'RESET' });
    expect(next.form.fototipo).toBeNull();
    expect(next.points).toEqual([]);
    expect(next.activeTool).toBe('P');
  });
});

// ── Selectors ──

describe('countersByType', () => {
  it('returns 0 for all types when empty', () => {
    const c = countersByType([]);
    expect(c).toEqual({ P: 0, L: 0, M: 0, C: 0 });
  });

  it('counts by type correctly', () => {
    const points: LesionPoint[] = [
      { id: 'p1', type: 'P', x: 0.1, y: 0.1 },
      { id: 'p2', type: 'P', x: 0.2, y: 0.2 },
      { id: 'p3', type: 'L', x: 0.3, y: 0.3 },
      { id: 'p4', type: 'M', x: 0.4, y: 0.4 },
      { id: 'p5', type: 'M', x: 0.5, y: 0.5 },
      { id: 'p6', type: 'M', x: 0.6, y: 0.6 },
    ];
    const c = countersByType(points);
    expect(c).toEqual({ P: 2, L: 1, M: 3, C: 0 });
  });
});

// ── Hook integration tests ──

describe('useJjcEvaluacion (hook)', () => {
  it('initializes with correct defaults', () => {
    const { result } = renderHook(() => useJjcEvaluacion());
    expect(result.current.state.form.lugar).toBe('HOLOMEDIC');
    expect(result.current.state.form.fototipo).toBeNull();
    expect(result.current.state.activeTool).toBe('P');
    expect(result.current.counters).toEqual({ P: 0, L: 0, M: 0, C: 0 });
  });

  it('setFototipo updates the selection', () => {
    const { result } = renderHook(() => useJjcEvaluacion());
    act(() => result.current.setFototipo('III-IV'));
    expect(result.current.state.form.fototipo).toBe('III-IV');
  });

  it('setObservaciones caps at 500', () => {
    const { result } = renderHook(() => useJjcEvaluacion());
    act(() => result.current.setObservaciones('x'.repeat(600)));
    expect(result.current.state.form.observaciones.length).toBe(500);
  });

  it('addPoint and removePoint update counters', () => {
    const { result } = renderHook(() => useJjcEvaluacion());
    act(() => result.current.addPoint({ id: 'p1', type: 'P', x: 0.5, y: 0.5 }));
    act(() => result.current.addPoint({ id: 'p2', type: 'P', x: 0.3, y: 0.7 }));
    act(() => result.current.addPoint({ id: 'p3', type: 'L', x: 0.1, y: 0.2 }));
    expect(result.current.counters).toEqual({ P: 2, L: 1, M: 0, C: 0 });

    act(() => result.current.removePoint('p1'));
    expect(result.current.counters).toEqual({ P: 1, L: 1, M: 0, C: 0 });
  });

  it('counter never goes negative', () => {
    const { result } = renderHook(() => useJjcEvaluacion());
    act(() => result.current.removePoint('nonexistent'));
    expect(result.current.counters).toEqual({ P: 0, L: 0, M: 0, C: 0 });
  });
});
