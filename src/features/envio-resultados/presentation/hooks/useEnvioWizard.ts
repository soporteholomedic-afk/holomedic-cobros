/**
 * Envio-resultados CAMO/EMO wizard state machine.
 *
 * Multi-proyecto change (WU-2): picks are keyed by the composite
 * `pickKey(dni, idAten)` (format `'<dni>::<idAten>'`, mirroring the
 * FilesModal `'<folderPath>::<name>'` convention) so every atención
 * (ficha) of a patient owns its own CAMO/EMO slot. The reducer is
 * exported as a pure function; the hook is a thin `useReducer`
 * wrapper.
 *
 * Spec coverage (envio-resultados-multi-proyecto):
 *  - REQ-102 — per-ficha pick state, deselect prunes the DNI's slots.
 *  - REQ-103 — `SET_PICKS_BATCH` one-atomic-transition batch.
 *  - Legacy REQ-003 — steps, guards, round-trip `initialState`.
 */
import { useReducer } from 'react';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Types ----

/** Step the wizard is on. `1` = patients, `2` = CAMO, `3` = EMO, `4` = summary. */
export type WizardStep = 1 | 2 | 3 | 4;

/**
 * One CAMO/EMO pick per (dni, idAten) atención. `null` means "Saltar"
 * (the user explicitly skipped the exam for that slot).
 *
 * `displayName` is the file basename shown in the summary row.
 */
export type WizardFilePick = { ref: SelectedFileRef; displayName: string } | null;

/**
 * One element of a `SET_PICKS_BATCH` action: the slot kind, the
 * atención it targets, and the pick (or `null` = skip).
 */
export type WizardBatchPick = {
  slotKind: 'camo' | 'emo';
  idAten: string;
  pick: WizardFilePick;
};

/** Composite key for a per-ficha pick: `'<dni>::<idAten>'`. */
export const pickKey = (dni: string, idAten: string): string => `${dni}::${idAten}`;

export interface WizardState {
  currentStep: WizardStep;
  /**
   * Highest step the user has visited. Monotonically increasing
   * (only ever advances via `NEXT`; never decreases). The stepper
   * uses this to allow back-jumps to any step ≤ `maxVisitedStep`.
   */
  maxVisitedStep: WizardStep;
  selectedDnIs: Set<string>;
  /** CAMO picks keyed by `pickKey(dni, idAten)`. `null` = Saltar. */
  camoPicks: Record<string, WizardFilePick>;
  /** EMO picks keyed by `pickKey(dni, idAten)`. `null` = Saltar. */
  emoPicks: Record<string, WizardFilePick>;
}

export type WizardAction =
  | { type: 'TOGGLE_PATIENT'; dni: string }
  | { type: 'SET_CAMO'; dni: string; idAten: string; pick: WizardFilePick }
  | { type: 'SET_EMO'; dni: string; idAten: string; pick: WizardFilePick }
  | { type: 'SET_PICKS_BATCH'; dni: string; picks: ReadonlyArray<WizardBatchPick> }
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
   * Optional restored state (used by the wizard → email round-trip
   * to remount the wizard at step 4 with the previous picks intact).
   */
  initialState?: WizardState;
}

export interface UseEnvioWizardResult {
  state: WizardState;
  canAdvance: boolean;
  togglePatient: (dni: string) => void;
  setCamo: (dni: string, idAten: string, pick: WizardFilePick) => void;
  setEmo: (dni: string, idAten: string, pick: WizardFilePick) => void;
  setPicksBatch: (dni: string, picks: ReadonlyArray<WizardBatchPick>) => void;
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
    camoPicks: {},
    emoPicks: {},
  };
}

/** Return a shallow copy of `record` without every key starting
 *  with `prefix`; returns the same reference when nothing matches. */
function omitPrefix<T>(record: Record<string, T>, prefix: string): Record<string, T> {
  const next: Record<string, T> = {};
  let changed = false;
  for (const k of Object.keys(record)) {
    if (k.startsWith(prefix)) {
      changed = true;
      continue;
    }
    next[k] = record[k];
  }
  return changed ? next : record;
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
 *  - `SET_CAMO` / `SET_EMO` / `SET_PICKS_BATCH` are NO-OPs when the
 *    dni is not in `selectedDnIs` (the wizard cannot record a pick
 *    for a patient that has not been selected at step 1). This also
 *    makes a late batch dispatch after deselect a safe no-op. The
 *    reducer does NOT throw — the step-2/3 components always have a
 *    `selectedDnIs` guarantee by construction, so a guard hit
 *    indicates a logic bug in the calling code.
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
      // Prune all of the DNI's per-ficha picks on deselect so
      // re-selecting starts from a clean slate. On add, the maps
      // are unchanged.
      const camoPicks = isSelected
        ? omitPrefix(state.camoPicks, `${action.dni}::`)
        : state.camoPicks;
      const emoPicks = isSelected
        ? omitPrefix(state.emoPicks, `${action.dni}::`)
        : state.emoPicks;
      return {
        ...state,
        selectedDnIs: next,
        camoPicks,
        emoPicks,
      };
    }

    case 'SET_CAMO': {
      if (!state.selectedDnIs.has(action.dni)) return state;
      return {
        ...state,
        camoPicks: { ...state.camoPicks, [pickKey(action.dni, action.idAten)]: action.pick },
      };
    }

    case 'SET_EMO': {
      if (!state.selectedDnIs.has(action.dni)) return state;
      return {
        ...state,
        emoPicks: { ...state.emoPicks, [pickKey(action.dni, action.idAten)]: action.pick },
      };
    }

    case 'SET_PICKS_BATCH': {
      if (!state.selectedDnIs.has(action.dni)) return state;
      // One atomic transition: the whole batch merges into the pick
      // maps here so `onStateChange` observers see a single snapshot.
      const camoPicks = { ...state.camoPicks };
      const emoPicks = { ...state.emoPicks };
      for (const entry of action.picks) {
        const key = pickKey(action.dni, entry.idAten);
        if (entry.slotKind === 'camo') {
          camoPicks[key] = entry.pick;
        } else {
          emoPicks[key] = entry.pick;
        }
      }
      return { ...state, camoPicks, emoPicks };
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
    setCamo: (dni, idAten, pick) => dispatch({ type: 'SET_CAMO', dni, idAten, pick }),
    setEmo: (dni, idAten, pick) => dispatch({ type: 'SET_EMO', dni, idAten, pick }),
    setPicksBatch: (dni, picks) => dispatch({ type: 'SET_PICKS_BATCH', dni, picks }),
    next: () => dispatch({ type: 'NEXT' }),
    prev: () => dispatch({ type: 'PREV' }),
    goToStep: (step) => dispatch({ type: 'GO_TO_STEP', step }),
    reset: () => dispatch({ type: 'RESET' }),
  };
}
