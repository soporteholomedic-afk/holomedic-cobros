/**
 * PR envio-resultados CAMO/EMO wizard — WU-1.3.
 *
 * `useEnvioWizard` is the 4-step wizard state machine. The reducer +
 * selectors are exported as pure functions so PR3 can exercise the
 * round-trip without React. The thin `useEnvioWizard` hook just
 * wraps `useReducer` and exposes imperative handlers.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-003 — state machine, canAdvance, actions.
 *  - Scenarios S-003, S-004, S-005, S-009, S-020, S-021.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  canAdvance,
  envioWizardReducer,
  initialWizardState,
  useEnvioWizard,
  type WizardState,
} from '../useEnvioWizard';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Fixture helpers ----

function makeRef(overrides: Partial<SelectedFileRef> = {}): SelectedFileRef {
  return {
    ruc: '20123456789',
    dni: '12345678',
    idAten: 'AT-001',
    path: 'LEGAJOS',
    name: '75618561CERT.pdf',
    ...overrides,
  };
}

const people = [{ dni: '11111111' }, { dni: '22222222' }, { dni: '33333333' }] as const;

// ================================================================
// Pure helpers
// ================================================================

describe('initialWizardState', () => {
  it('starts at step 1 with empty selection and empty per-patient maps', () => {
    const state = initialWizardState();
    expect(state.currentStep).toBe(1);
    expect(state.maxVisitedStep).toBe(1);
    expect(state.selectedDnIs).toBeInstanceOf(Set);
    expect(state.selectedDnIs.size).toBe(0);
    expect(state.camoByDni).toEqual({});
    expect(state.emoByDni).toEqual({});
  });
});

describe('canAdvance', () => {
  const baseState = initialWizardState();

  it('is false at step 1 with 0 selected patients', () => {
    expect(canAdvance(baseState)).toBe(false);
  });

  it('is true at step 1 with 1 selected patient', () => {
    const state: WizardState = { ...baseState, selectedDnIs: new Set(['11111111']) };
    expect(canAdvance(state)).toBe(true);
  });

  it('is true at step 1 with multiple selected patients', () => {
    const state: WizardState = {
      ...baseState,
      selectedDnIs: new Set(['11111111', '22222222', '33333333']),
    };
    expect(canAdvance(state)).toBe(true);
  });

  it('is true at step 2 regardless of selections', () => {
    const state: WizardState = { ...baseState, currentStep: 2, maxVisitedStep: 2 };
    expect(canAdvance(state)).toBe(true);
  });

  it('is true at step 3 regardless of selections', () => {
    const state: WizardState = { ...baseState, currentStep: 3, maxVisitedStep: 3 };
    expect(canAdvance(state)).toBe(true);
  });

  it('is false at step 4 (no "next" from the summary step)', () => {
    const state: WizardState = { ...baseState, currentStep: 4, maxVisitedStep: 4 };
    expect(canAdvance(state)).toBe(false);
  });
});

// ================================================================
// Reducer — pure transition tests
// ================================================================

describe('envioWizardReducer', () => {
  it('TOGGLE_PATIENT adds a dni to selectedDnIs', () => {
    const start = initialWizardState();
    const next = envioWizardReducer(start, { type: 'TOGGLE_PATIENT', dni: '11111111' });
    expect(next.selectedDnIs.has('11111111')).toBe(true);
    expect(next.selectedDnIs.size).toBe(1);
  });

  it('TOGGLE_PATIENT removes a dni that is already selected', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111', '22222222']),
    };
    const next = envioWizardReducer(start, { type: 'TOGGLE_PATIENT', dni: '11111111' });
    expect(next.selectedDnIs.has('11111111')).toBe(false);
    expect(next.selectedDnIs.has('22222222')).toBe(true);
    expect(next.selectedDnIs.size).toBe(1);
  });

  it('TOGGLE_PATIENT on removal prunes the dni from camoByDni and emoByDni', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
      camoByDni: { '11111111': { ref: makeRef(), displayName: '75618561CERT.pdf' } },
      emoByDni: { '11111111': { ref: makeRef({ name: '012109975EXPED.pdf' }), displayName: '012109975EXPED.pdf' } },
    };
    const next = envioWizardReducer(start, { type: 'TOGGLE_PATIENT', dni: '11111111' });
    expect(next.camoByDni).toEqual({});
    expect(next.emoByDni).toEqual({});
  });

  it('SET_CAMO stores the pick in camoByDni', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
    };
    const pick = { ref: makeRef(), displayName: '75618561CERT.pdf' };
    const next = envioWizardReducer(start, { type: 'SET_CAMO', dni: '11111111', pick });
    expect(next.camoByDni['11111111']).toBe(pick);
  });

  it('SET_CAMO with null stores null (Saltar)', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
    };
    const next = envioWizardReducer(start, { type: 'SET_CAMO', dni: '11111111', pick: null });
    expect(next.camoByDni['11111111']).toBeNull();
  });

  it('SET_CAMO is a no-op when the dni is not in selectedDnIs', () => {
    const start = initialWizardState();
    const pick = { ref: makeRef(), displayName: '75618561CERT.pdf' };
    const next = envioWizardReducer(start, { type: 'SET_CAMO', dni: '11111111', pick });
    // State must be returned unchanged (referential stability) because
    // the dni was never selected. The reducer does NOT throw.
    expect(next).toBe(start);
    expect(next.camoByDni['11111111']).toBeUndefined();
  });

  it('SET_EMO is symmetric to SET_CAMO', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
    };
    const pick = { ref: makeRef({ name: '012109975EXPED.pdf' }), displayName: '012109975EXPED.pdf' };
    const next = envioWizardReducer(start, { type: 'SET_EMO', dni: '11111111', pick });
    expect(next.emoByDni['11111111']).toBe(pick);
  });

  it('SET_EMO with null stores null (Saltar)', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
    };
    const next = envioWizardReducer(start, { type: 'SET_EMO', dni: '11111111', pick: null });
    expect(next.emoByDni['11111111']).toBeNull();
  });

  it('NEXT from step 1 with at least 1 selected advances to step 2', () => {
    const start: WizardState = {
      ...initialWizardState(),
      selectedDnIs: new Set(['11111111']),
    };
    const next = envioWizardReducer(start, { type: 'NEXT' });
    expect(next.currentStep).toBe(2);
    expect(next.maxVisitedStep).toBe(2);
  });

  it('NEXT from step 1 with 0 selected is a no-op', () => {
    const start = initialWizardState();
    const next = envioWizardReducer(start, { type: 'NEXT' });
    expect(next).toBe(start);
  });

  it('NEXT from step 2 always advances to step 3', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 2, maxVisitedStep: 2 };
    const next = envioWizardReducer(start, { type: 'NEXT' });
    expect(next.currentStep).toBe(3);
    expect(next.maxVisitedStep).toBe(3);
  });

  it('NEXT from step 3 always advances to step 4', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 3, maxVisitedStep: 3 };
    const next = envioWizardReducer(start, { type: 'NEXT' });
    expect(next.currentStep).toBe(4);
    expect(next.maxVisitedStep).toBe(4);
  });

  it('NEXT from step 4 is a no-op (no step beyond 4)', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 4, maxVisitedStep: 4 };
    const next = envioWizardReducer(start, { type: 'NEXT' });
    expect(next).toBe(start);
  });

  it('PREV from step > 1 decrements currentStep (maxVisitedStep unchanged)', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 3, maxVisitedStep: 3 };
    const next = envioWizardReducer(start, { type: 'PREV' });
    expect(next.currentStep).toBe(2);
    expect(next.maxVisitedStep).toBe(3);
  });

  it('PREV from step 1 is a no-op', () => {
    const start = initialWizardState();
    const next = envioWizardReducer(start, { type: 'PREV' });
    expect(next).toBe(start);
  });

  it('GO_TO_STEP to a step ≤ maxVisitedStep is allowed', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 3, maxVisitedStep: 3 };
    const next = envioWizardReducer(start, { type: 'GO_TO_STEP', step: 1 });
    expect(next.currentStep).toBe(1);
    expect(next.maxVisitedStep).toBe(3);
  });

  it('GO_TO_STEP to a step > maxVisitedStep is a no-op', () => {
    const start: WizardState = { ...initialWizardState(), currentStep: 2, maxVisitedStep: 2 };
    const next = envioWizardReducer(start, { type: 'GO_TO_STEP', step: 4 });
    expect(next).toBe(start);
  });

  it('RESET returns to the initial state (selectedDnIs is a new Set instance)', () => {
    const start: WizardState = {
      ...initialWizardState(),
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoByDni: { '11111111': { ref: makeRef(), displayName: 'x' } },
      emoByDni: {},
    };
    const next = envioWizardReducer(start, { type: 'RESET' });
    expect(next.currentStep).toBe(1);
    expect(next.maxVisitedStep).toBe(1);
    expect(next.selectedDnIs.size).toBe(0);
    expect(next.camoByDni).toEqual({});
    expect(next.emoByDni).toEqual({});
  });
});

// ================================================================
// Hook wrapper
// ================================================================

describe('useEnvioWizard', () => {
  it('exposes the initial state on first render', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    expect(result.current.state.currentStep).toBe(1);
    expect(result.current.state.selectedDnIs.size).toBe(0);
  });

  it('canAdvance is false on first render (no patients selected)', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    expect(result.current.canAdvance).toBe(false);
  });

  it('togglePatient adds and removes a dni', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));

    act(() => {
      result.current.togglePatient('11111111');
    });
    expect(result.current.state.selectedDnIs.has('11111111')).toBe(true);
    expect(result.current.canAdvance).toBe(true);

    act(() => {
      result.current.togglePatient('11111111');
    });
    expect(result.current.state.selectedDnIs.has('11111111')).toBe(false);
    expect(result.current.canAdvance).toBe(false);
  });

  it('next advances to step 2 once at least one patient is selected', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));

    act(() => {
      result.current.togglePatient('11111111');
    });
    act(() => {
      result.current.next();
    });
    expect(result.current.state.currentStep).toBe(2);
  });

  it('next is a no-op at step 1 with no selection', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    act(() => {
      result.current.next();
    });
    expect(result.current.state.currentStep).toBe(1);
  });

  it('prev decrements the current step', () => {
    const initial: WizardState = {
      ...initialWizardState(),
      currentStep: 2,
      maxVisitedStep: 2,
    };
    const { result } = renderHook(() => useEnvioWizard({ people, initialState: initial }));
    act(() => {
      result.current.prev();
    });
    expect(result.current.state.currentStep).toBe(1);
  });

  it('reset returns to the initial state', () => {
    const initial: WizardState = {
      ...initialWizardState(),
      currentStep: 4,
      maxVisitedStep: 4,
      selectedDnIs: new Set(['11111111', '22222222']),
    };
    const { result } = renderHook(() => useEnvioWizard({ people, initialState: initial }));
    act(() => {
      result.current.reset();
    });
    expect(result.current.state.currentStep).toBe(1);
    expect(result.current.state.maxVisitedStep).toBe(1);
    expect(result.current.state.selectedDnIs.size).toBe(0);
  });

  it('setCamo stores the pick in camoByDni for a selected patient', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    act(() => {
      result.current.togglePatient('11111111');
    });
    const pick = { ref: makeRef(), displayName: '75618561CERT.pdf' };
    act(() => {
      result.current.setCamo('11111111', pick);
    });
    expect(result.current.state.camoByDni['11111111']).toBe(pick);
  });

  it('setCamo with null stores null (Saltar)', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    act(() => {
      result.current.togglePatient('11111111');
    });
    act(() => {
      result.current.setCamo('11111111', null);
    });
    expect(result.current.state.camoByDni['11111111']).toBeNull();
  });

  it('setEmo is symmetric to setCamo', () => {
    const { result } = renderHook(() => useEnvioWizard({ people }));
    act(() => {
      result.current.togglePatient('11111111');
    });
    const pick = { ref: makeRef({ name: '012109975EXPED.pdf' }), displayName: '012109975EXPED.pdf' };
    act(() => {
      result.current.setEmo('11111111', pick);
    });
    expect(result.current.state.emoByDni['11111111']).toBe(pick);
  });

  it('goToStep is allowed for a step ≤ maxVisitedStep', () => {
    const initial: WizardState = {
      ...initialWizardState(),
      currentStep: 3,
      maxVisitedStep: 3,
    };
    const { result } = renderHook(() => useEnvioWizard({ people, initialState: initial }));
    act(() => {
      result.current.goToStep(1);
    });
    expect(result.current.state.currentStep).toBe(1);
  });

  it('goToStep is a no-op for a step > maxVisitedStep', () => {
    const initial: WizardState = {
      ...initialWizardState(),
      currentStep: 2,
      maxVisitedStep: 2,
    };
    const { result } = renderHook(() => useEnvioWizard({ people, initialState: initial }));
    act(() => {
      result.current.goToStep(4);
    });
    expect(result.current.state.currentStep).toBe(2);
  });

  it('honors the initialState prop on first render (round-trip restoration)', () => {
    const restored: WizardState = {
      currentStep: 4,
      maxVisitedStep: 4,
      selectedDnIs: new Set(['11111111', '22222222']),
      camoByDni: { '11111111': { ref: makeRef(), displayName: 'x' } },
      emoByDni: {},
    };
    const { result } = renderHook(() =>
      useEnvioWizard({ people, initialState: restored }),
    );
    expect(result.current.state.currentStep).toBe(4);
    expect(result.current.state.selectedDnIs.size).toBe(2);
    expect(result.current.state.camoByDni['11111111']).toEqual({
      ref: expect.objectContaining({ name: '75618561CERT.pdf' }),
      displayName: 'x',
    });
  });
});
