/**
 * PR envio-resultados CAMO/EMO wizard — WU-1.4.
 *
 * Numbered chip stepper for the 4-step wizard (1 Pacientes → 2 CAMO
 * → 3 EMO → 4 Resumen). The component is a thin, dumb renderer:
 *
 *   - It does NOT own wizard state. The parent (envio wizard shell)
 *     passes `currentStep`, `visitedSteps`, and `onGoToStep`.
 *   - A chip is a real `<button>` when its step is in
 *     `visitedSteps` (clickable, fires `onGoToStep(step)`).
 *   - A chip is `<button disabled>` when its step is NOT in
 *     `visitedSteps` (future step the user has not reached yet).
 *   - The current step carries `aria-current="step"` for assistive
 *     tech (ARIA spec for a navigational step indicator).
 *
 * Visual style mirrors the existing `DocumentVerificationModal`
 * chrome — slate-200 borders, sky accents for the active step, soft
 * background tints for visited-but-not-current steps.
 */
'use client';

import type { ReactElement } from 'react';

export type WizardStepNumber = 1 | 2 | 3 | 4;

export interface WizardStepperProps {
  currentStep: WizardStepNumber;
  /**
   * Set of step numbers the user has visited. The parent builds
   * this from `state.maxVisitedStep` (e.g. `new Set([1,2,3])` when
   * `maxVisitedStep === 3`). The stepper never mutates this set.
   */
  visitedSteps: ReadonlySet<WizardStepNumber>;
  /** Fires when a visited (enabled) chip is clicked. */
  onGoToStep: (step: WizardStepNumber) => void;
}

const STEP_NUMBERS: ReadonlyArray<WizardStepNumber> = [1, 2, 3, 4];

/** Labels rendered in the chip. Numbers are sufficient for the
 *  numeric stepper; the full step name lives in the wizard body
 *  header (added by the wizard shell in PR 2a). */
const STEP_LABELS: Record<WizardStepNumber, string> = {
  1: '1',
  2: '2',
  3: '3',
  4: '4',
};

export function WizardStepper({
  currentStep,
  visitedSteps,
  onGoToStep,
}: WizardStepperProps): ReactElement {
  return (
    <nav
      aria-label="Pasos del asistente"
      className="flex items-center gap-2"
      data-testid="wizard-stepper"
    >
      {STEP_NUMBERS.map((step) => {
        const isCurrent = step === currentStep;
        const isVisited = visitedSteps.has(step);
        const baseClass =
          'inline-flex items-center justify-center min-w-[2.25rem] h-9 px-3 rounded-full text-sm font-semibold transition-colors border';
        const stateClass = isCurrent
          ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
          : isVisited
            ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
            : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed';
        return (
          <button
            key={step}
            type="button"
            data-testid={`wizard-stepper-chip-${step}`}
            disabled={!isVisited}
            aria-current={isCurrent ? 'step' : undefined}
            onClick={() => onGoToStep(step)}
            className={`${baseClass} ${stateClass}`}
          >
            {STEP_LABELS[step]}
          </button>
        );
      })}
    </nav>
  );
}
