/**
 * PR envio-resultados CAMO/EMO wizard — WU-1.4.
 *
 * WizardStepper is a thin, dumb presentational component: it renders
 * four numbered chips (1–4), marks the current one with
 * `aria-current="step"`, and fires `onGoToStep` when a *visited*
 * chip is clicked. Future chips are rendered as `<button disabled>`.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-002 — wizard shell + stepper (4 chips, visited clickable,
 *    future disabled).
 *  - Scenario S-020 — at step 3, chips 1 & 2 clickable, chip 4
 *    disabled.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { WizardStepper } from '../../wizard/WizardStepper';

const ALL_STEPS: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4];

function renderStepper(
  overrides: Partial<React.ComponentProps<typeof WizardStepper>> = {},
) {
  const onGoToStep = vi.fn();
  const props: React.ComponentProps<typeof WizardStepper> = {
    currentStep: 1,
    visitedSteps: new Set<1 | 2 | 3 | 4>(ALL_STEPS),
    onGoToStep,
    ...overrides,
  };
  return { ...render(<WizardStepper {...props} />), onGoToStep };
}

describe('WizardStepper', () => {
  it('renders 4 numbered chips (1, 2, 3, 4)', () => {
    renderStepper();
    for (const n of ALL_STEPS) {
      expect(screen.getByTestId(`wizard-stepper-chip-${n}`)).toBeInTheDocument();
    }
    // Each chip's label is its number.
    expect(screen.getByTestId('wizard-stepper-chip-1')).toHaveTextContent('1');
    expect(screen.getByTestId('wizard-stepper-chip-2')).toHaveTextContent('2');
    expect(screen.getByTestId('wizard-stepper-chip-3')).toHaveTextContent('3');
    expect(screen.getByTestId('wizard-stepper-chip-4')).toHaveTextContent('4');
  });

  it('marks the current step chip with aria-current="step"', () => {
    renderStepper({ currentStep: 3 });
    expect(screen.getByTestId('wizard-stepper-chip-3')).toHaveAttribute('aria-current', 'step');
    // Other chips must NOT carry aria-current.
    for (const n of [1, 2, 4] as const) {
      expect(screen.getByTestId(`wizard-stepper-chip-${n}`)).not.toHaveAttribute(
        'aria-current',
      );
    }
  });

  it('marks visited chips (steps in visitedSteps) as enabled buttons', () => {
    renderStepper({
      currentStep: 3,
      visitedSteps: new Set<1 | 2 | 3 | 4>([1, 2, 3]),
    });
    for (const n of [1, 2, 3] as const) {
      expect(screen.getByTestId(`wizard-stepper-chip-${n}`)).toBeEnabled();
    }
  });

  it('marks future chips (not in visitedSteps) as disabled', () => {
    renderStepper({
      currentStep: 3,
      visitedSteps: new Set<1 | 2 | 3 | 4>([1, 2, 3]),
    });
    // Step 4 has not been visited yet.
    expect(screen.getByTestId('wizard-stepper-chip-4')).toBeDisabled();
  });

  it('fires onGoToStep when a visited chip is clicked', () => {
    const { onGoToStep } = renderStepper({
      currentStep: 3,
      visitedSteps: new Set<1 | 2 | 3 | 4>([1, 2, 3]),
    });
    fireEvent.click(screen.getByTestId('wizard-stepper-chip-1'));
    expect(onGoToStep).toHaveBeenCalledTimes(1);
    expect(onGoToStep).toHaveBeenCalledWith(1);
  });

  it('does NOT fire onGoToStep when a future (disabled) chip is clicked', () => {
    const { onGoToStep } = renderStepper({
      currentStep: 3,
      visitedSteps: new Set<1 | 2 | 3 | 4>([1, 2, 3]),
    });
    fireEvent.click(screen.getByTestId('wizard-stepper-chip-4'));
    expect(onGoToStep).not.toHaveBeenCalled();
  });

  it('still renders when visitedSteps is empty (all chips disabled)', () => {
    renderStepper({
      currentStep: 1,
      visitedSteps: new Set<1 | 2 | 3 | 4>(),
    });
    for (const n of ALL_STEPS) {
      expect(screen.getByTestId(`wizard-stepper-chip-${n}`)).toBeDisabled();
    }
  });
});
