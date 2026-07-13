/**
 * PR envio-resultados CAMO/EMO wizard — WU-1.3.
 *
 * Pure state machine for the 4-step envio wizard. The reducer and
 * selectors are exported as pure functions so PR3 can test the
 * wizard → EmailEditor round-trip without React. The
 * `useEnvioWizard` hook below is a thin `useReducer` wrapper.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-003 — state machine, canAdvance, actions.
 *  - Scenarios S-003, S-004, S-005, S-009, S-020, S-021.
 */
import { useReducer } from 'react';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Types ----

/** Step the wizard is on. `1` = patients, `2` = CAMO, `3` = EMO, `4` = summary. */
export type WizardStep = 1 | 2 | 3 | 4;

/**
 * One CAMO/EMO pick per (dni). `null` means "Saltar" (the user
 * explicitly skipped the exam for that patient).
 *
 * `displayName` is the file basename shown in the summary row.
 */
export type WizardFilePick = { ref: SelectedFileRef; displayName: string } | null;

export interface WizardState {
  currentStep: WizardStep;
  /**
   * Highest step the user has visited. Monotonically increasing
   * (only ever advances via `NEXT`; never decreases). The stepper
   * uses this to allow back-jumps to any step ≤ `maxVisitedStep`.
   */
  maxVisitedStep: WizardStep;
  selectedDnIs: Set<string>;
  camoByDni: Record<string, WizardFilePick>;
  emoByDni: Record<string, WizardFilePick>;
}

export type WizardAction =
  | { type: 'TOGGLE_PATIENT'; dni: string }
  | { type: 'SET_CAMO'; dni: string; pick: WizardFilePick }
  | { type: 'SET_EMO'; dni: string; pick: WizardFilePick }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'RESET' };

export interface UseEnvioWizardOptions {
  /**
   * Currently filtered patients (e.g. the `UnifiedPerson[]` from
   * `useUnifiedResults`). Currently informational — the hook does not
   * mutate this list. Kept on the options shape so a future PR can
   * pre-validate `selectedDnIs` against it (e.g. drop selections
   * that no longer exist after a refetch).
   */
  people: ReadonlyArray<{ dni: string }>;
  /**
   * Optional restored state (used by the PR3 wizard → email round-trip
   * to remount the wizard at step 4 with the previous picks intact).
   */
  initialState?: WizardState;
}

export interface UseEnvioWizardResult {
  state: WizardState;
  canAdvance: boolean;
  togglePatient: (dni: string) => void;
  setCamo: (dni: string, pick: WizardFilePick) => void;
  setEmo: (dni: string, pick: WizardFilePick) => void;
  next: () => void;
  prev: () => void;
  goToStep: (step: WizardStep) => void;
  reset: () => void;
}

// ---- Initial state ----

/** Build the initial wizard state. The hook receives `people` for
 *  future use (e.g. validating that a restored `selectedDnIs` is
 *  still valid after a refetch); the initial state itself does not
 *  depend on it. */
export function initialWizardState(): WizardState {
  return {
    currentStep: 1,
    maxVisitedStep: 1,
    selectedDnIs: new Set<string>(),
    camoByDni: {},
    emoByDni: {},
  };
}

/** Return a shallow copy of `record` with `key` removed. */
function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next: Record<string, T> = {};
  for (const k of Object.keys(record)) {
    if (k !== key) next[k] = record[k];
  }
  return next;
}

// ---- Selectors ----

/**
 * Whether the user can advance from the current step. The hook
 * re-derives this every render from `state` so the disabled/enabled
 * state of the "Siguiente" footer button stays in sync.
 *
 * Step 1 requires ≥ 1 patient selected. Steps 2 and 3 always advance
 * (skip-per-patient is the escape hatch). Step 4 has no "next".
 */
export function canAdvance(state: WizardState): boolean {
  if (state.currentStep === 1) return state.selectedDnIs.size > 0;
  if (state.currentStep === 4) return false;
  return true;
}

// ---- Reducer ----

/**
 * Pure reducer for the wizard state machine.
 *
 * Guard policies:
 *  - `SET_CAMO` / `SET_EMO` are NO-OPs when the dni is not in
 *    `selectedDnIs` (the wizard cannot record a pick for a patient
 *    that has not been selected at step 1). The reducer does NOT
 *    throw — the step-2/3 components always have a `selectedDnIs`
 *    guarantee by construction, so a guard hit indicates a logic
 *    bug in the calling code.
 *  - `GO_TO_STEP` is a no-op for steps > `maxVisitedStep` (the
 *    user can only jump back to previously visited steps).
 *  - `PREV` at step 1 is a no-op.
 *  - `NEXT` at step 1 is gated by `canAdvance`.
 *  - `NEXT` at step 4 is a no-op (the wizard ends at step 4).
 */
export function envioWizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'TOGGLE_PATIENT': {
      const isSelected = state.selectedDnIs.has(action.dni);
      const next = new Set(state.selectedDnIs);
      if (isSelected) {
        next.delete(action.dni);
      } else {
        next.add(action.dni);
      }
      // Prune per-patient picks on deselect so re-selecting starts
      // from a clean slate. On add, the maps are unchanged.
      const camoByDni = isSelected ? omitKey(state.camoByDni, action.dni) : state.camoByDni;
      const emoByDni = isSelected ? omitKey(state.emoByDni, action.dni) : state.emoByDni;
      return {
        ...state,
        selectedDnIs: next,
        camoByDni,
        emoByDni,
      };
    }

    case 'SET_CAMO': {
      if (!state.selectedDnIs.has(action.dni)) return state;
      return {
        ...state,
        camoByDni: { ...state.camoByDni, [action.dni]: action.pick },
      };
    }

    case 'SET_EMO': {
      if (!state.selectedDnIs.has(action.dni)) return state;
      return {
        ...state,
        emoByDni: { ...state.emoByDni, [action.dni]: action.pick },
      };
    }

    case 'NEXT': {
      if (!canAdvance(state)) return state;
      const nextStep = (state.currentStep + 1) as WizardStep;
      return {
        ...state,
        currentStep: nextStep,
        maxVisitedStep: Math.max(state.maxVisitedStep, nextStep) as WizardStep,
      };
    }

    case 'PREV': {
      if (state.currentStep === 1) return state;
      const prevStep = (state.currentStep - 1) as WizardStep;
      return { ...state, currentStep: prevStep };
    }

    case 'GO_TO_STEP': {
      if (action.step > state.maxVisitedStep) return state;
      return { ...state, currentStep: action.step };
    }

    case 'RESET': {
      return initialWizardState();
    }
  }
}

// ---- Hook ----

/**
 * Thin React wrapper around `useReducer(envioWizardReducer, …)`.
 * Exposes imperative action handlers and a memoized `canAdvance`.
 */
export function useEnvioWizard(
  { initialState }: UseEnvioWizardOptions,
): UseEnvioWizardResult {
  const [state, dispatch] = useReducer(
    envioWizardReducer,
    initialState ?? initialWizardState(),
  );
  return {
    state,
    canAdvance: canAdvance(state),
    togglePatient: (dni) => dispatch({ type: 'TOGGLE_PATIENT', dni }),
    setCamo: (dni, pick) => dispatch({ type: 'SET_CAMO', dni, pick }),
    setEmo: (dni, pick) => dispatch({ type: 'SET_EMO', dni, pick }),
    next: () => dispatch({ type: 'NEXT' }),
    prev: () => dispatch({ type: 'PREV' }),
    goToStep: (step) => dispatch({ type: 'GO_TO_STEP', step }),
    reset: () => dispatch({ type: 'RESET' }),
  };
}
