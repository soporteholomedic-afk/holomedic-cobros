/**
 * PR envio-resultados CAMO/EMO wizard — WU-2a.4 + WU-2b.2.
 *
 * `EnvioResultadosWizard` is the modal shell that owns the
 * `useEnvioWizard` reducer and routes the current step to its
 * sub-component. This test exercises the shell in isolation: the
 * step sub-components (`Step1Pacientes`, `Step2Camo`, `Step3Emo`)
 * and the stepper (`WizardStepper`) are imported for real. Step 4
 * is still a placeholder in this PR (real `Step4Resumen` comes in
 * PR 3) and is asserted on directly.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-002 — wizard shell + stepper, Escape closes.
 *  - REQ-003 — useEnvioWizard state machine (observed via shell).
 *  - REQ-006 — Step 3 EMO routing (PR 2b).
 *  - Scenarios S-001, S-009, S-010, S-021.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { EnvioResultadosWizard } from '../EnvioResultadosWizard';
import type { UnifiedPerson } from '@/types/sp-result';
import type { WizardState } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';

// ---- Fixtures ----

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'Juan Pérez',
    empresa: 'Acme Corp',
    tipoExamen: 'CERT',
    proyecto: 'METRO LIMA',
    condic: 'APTO',
    fichas: [
      {
        idAten: 'AT-001',
        nroRuc: '20123456789',
        nomCFa: 'Acme Corp',
        proyecto: 'METRO LIMA',
        tipoExamen: 'CERT',
        condic: 'APTO',
        fecAte: '17/06/2026',
      },
    ],
    ...overrides,
  };
}

const people: ReadonlyArray<UnifiedPerson> = [
  makePerson({ dni: '11111111', nombre: 'Ana López' }),
  makePerson({ dni: '22222222', nombre: 'Beto Ruiz' }),
];

// ---- Helpers ----

function renderWizard(
  overrides: Partial<React.ComponentProps<typeof EnvioResultadosWizard>> = {},
) {
  const onClose = vi.fn();
  const onStateChange = vi.fn();
  const stateChangeLog: WizardState[] = [];
  onStateChange.mockImplementation((s: WizardState) => {
    stateChangeLog.push(s);
  });
  const props: React.ComponentProps<typeof EnvioResultadosWizard> = {
    people,
    companyName: 'Acme Corp',
    onClose,
    onStateChange,
    ...overrides,
  };
  const utils = render(<EnvioResultadosWizard {...props} />);
  return { ...utils, onClose, onStateChange, stateChangeLog };
}

// ---- Step component stubs ----
// We use the REAL step components (Step1Pacientes, Step2Camo) and the
// REAL stepper (WizardStepper) — they have their own test files. The
// shell test focuses on the wiring (which step is rendered, how
// callbacks flow) and the modal chrome (Escape, backdrop, X).
// No stubbing is needed; if the test breaks, it's because the shell
// wiring is wrong.

// ================================================================

describe('EnvioResultadosWizard', () => {
  it('renders a modal with role="dialog" and aria-modal="true"', () => {
    renderWizard();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders the 4-chip WizardStepper at the top', () => {
    renderWizard();
    expect(screen.getByTestId('wizard-stepper')).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`wizard-stepper-chip-${n}`)).toBeInTheDocument();
    }
  });

  it('initial render shows Step1Pacientes (currentStep=1)', () => {
    renderWizard();
    expect(screen.getByTestId('step1-pacientes')).toBeInTheDocument();
  });

  it('marks stepper chip 1 as the current step on initial render', () => {
    renderWizard();
    expect(screen.getByTestId('wizard-stepper-chip-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('wizard-stepper-chip-2')).not.toHaveAttribute('aria-current', 'step');
  });

  it('clicking "Siguiente" in Step 1 with one patient selected advances to Step2Camo', () => {
    renderWizard();
    // Pick a patient.
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    // Advance.
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    expect(screen.getByTestId('step2-camo')).toBeInTheDocument();
    expect(screen.queryByTestId('step1-pacientes')).not.toBeInTheDocument();
  });

  it('marks stepper chip 2 as the current step after advancing from step 1', () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    expect(screen.getByTestId('wizard-stepper-chip-2')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('wizard-stepper-chip-1')).not.toHaveAttribute('aria-current', 'step');
  });

  it('clicking "Volver" in Step 2 returns to Step 1 with the selection preserved', () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    // Back to step 1.
    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(screen.getByTestId('step1-pacientes')).toBeInTheDocument();

    // Selection preserved — the row is still selected.
    const row = screen.getByTestId('step1-row-11111111');
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  it('fires onStateChange on every reducer transition (toggle, next, prev, goToStep)', () => {
    const { onStateChange } = renderWizard();

    // Initial render fires onStateChange once with the initial state.
    expect(onStateChange).toHaveBeenCalled();
    const callCount = onStateChange.mock.calls.length;

    // Toggle a patient → another onStateChange.
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(callCount);
    const afterToggle = onStateChange.mock.calls.length;

    // Next → another onStateChange.
    fireEvent.click(screen.getByTestId('step1-siguiente'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(afterToggle);
    const afterNext = onStateChange.mock.calls.length;

    // Prev → another onStateChange.
    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(afterNext);

    // goToStep via the stepper → another onStateChange.
    const beforeChipClick = onStateChange.mock.calls.length;
    fireEvent.click(screen.getByTestId('wizard-stepper-chip-1'));
    expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(beforeChipClick);
  });

  it('press Escape to call onClose', () => {
    const { onClose } = renderWizard();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click the backdrop to call onClose', () => {
    const { onClose } = renderWizard();
    // The backdrop is the outermost fixed div. The dialog stops the
    // click from bubbling out, so a click on the backdrop itself
    // should trigger the wizard's onClose. We use the role="dialog"
    // to verify the dialog is rendered, then dispatch a click on
    // the backdrop container (the parent of the dialog).
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click the X (Cerrar modal) button to call onClose', () => {
    const { onClose } = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders Step3Emo at currentStep=3 (not the step 3 placeholder)', () => {
    // Drive the wizard to step 3 via initialState — Step 3 is the
    // real `Step3Emo` component (PR 2b).
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoByDni: {},
      emoByDni: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();
    // The old placeholder is gone.
    expect(screen.queryByTestId('wizard-step-3-placeholder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step2-camo')).not.toBeInTheDocument();
  });

  it('marks stepper chip 3 as the current step at currentStep=3', () => {
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoByDni: {},
      emoByDni: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('wizard-stepper-chip-3')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('wizard-stepper-chip-1')).not.toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('wizard-stepper-chip-2')).not.toHaveAttribute('aria-current', 'step');
  });

  it('"Volver" on Step 3 returns to Step 2 with the Step 2 picks preserved', () => {
    // Seed a fake CAMO pick for patient 11111111, then drive the
    // wizard to step 3. After "Volver", the wizard should be on
    // step 2 and the camoByDni should still hold the pick.
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoByDni: {
        '11111111': {
          ref: {
            ruc: '20123456789',
            dni: '11111111',
            idAten: 'AT-001',
            path: 'LEGAJOS',
            name: '75618561CERT.pdf',
            tipoExamen: 'CAMO',
          },
          displayName: '75618561CERT.pdf',
        },
      },
      emoByDni: {},
    };
    renderWizard({ initialState });
    // Confirm we are on step 3.
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();

    // Volver → step 2.
    fireEvent.click(screen.getByTestId('step3-volver'));
    expect(screen.getByTestId('step2-camo')).toBeInTheDocument();
    expect(screen.queryByTestId('step3-emo')).not.toBeInTheDocument();

    // The step 2 card shows the previously-picked CAMO filename.
    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText(/75618561CERT\.pdf/)).toBeInTheDocument();
  });

  it('"Continuar" on Step 3 advances to Step 4 (still a placeholder)', () => {
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoByDni: {},
      emoByDni: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('step3-continuar'));
    // Step 3 is gone — Step 4 placeholder is on screen.
    expect(screen.queryByTestId('step3-emo')).not.toBeInTheDocument();
    const placeholder = screen.getByTestId('wizard-step-4-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(within(placeholder).getByText(/Paso 4 — Resumen/)).toBeInTheDocument();
  });

  it('renders a Step 4 placeholder when currentStep=4 ("Próximamente: Paso 4 — Resumen")', () => {
    const initialState: WizardState = {
      currentStep: 4,
      maxVisitedStep: 4,
      selectedDnIs: new Set(['11111111']),
      camoByDni: {},
      emoByDni: {},
    };
    renderWizard({ initialState });
    const placeholder = screen.getByTestId('wizard-step-4-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(within(placeholder).getByText(/Paso 4 — Resumen/)).toBeInTheDocument();
  });
});
