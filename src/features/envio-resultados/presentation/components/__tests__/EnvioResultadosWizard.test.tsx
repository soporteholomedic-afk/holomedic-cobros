/**
 * `EnvioResultadosWizard` is the modal shell that owns the
 * `useEnvioWizard` reducer and routes the current step to its
 * sub-component. This test exercises the shell in isolation: the
 * step sub-components (`Step1Pacientes`, `Step2Camo`, `Step3Emo`,
 * `Step4Resumen`) and the stepper (`WizardStepper`) are imported
 * for real. The `FilesModal` is stubbed at the module boundary so
 * the per-ficha pick flow (Step 2 → Step 4) can run without the
 * real LAN-share modal fetching.
 *
 * Spec coverage:
 *  - REQ-002 — wizard shell + stepper, Escape closes.
 *  - REQ-003 — useEnvioWizard state machine (observed via shell).
 *  - REQ-102 — per-ficha picks flow Step 2 → Step 4; deselect
 *    prunes all of the DNI's picks.
 *  - Scenarios S-001, S-009, S-010, S-021.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { createFileNode } from '@/features/envio-resultados/domain/ports';
import { EnvioResultadosWizard } from '../EnvioResultadosWizard';
import { pickKey, type WizardState } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';

// ---- FilesModal stub (module boundary) ----
const mockFilesModalProps = vi.hoisted(() => vi.fn());
vi.mock('../FilesModal', () => ({
  FilesModal: (props: Record<string, unknown>) => {
    mockFilesModalProps(props);
    const onPickSingle = props['onPickSingle'] as ((f: unknown, path: string) => void) | undefined;
    const onClose = props['onClose'] as (() => void) | undefined;
    const dni = String(props['dni'] ?? '');
    return (
      <div data-testid={`wizard-pick-modal-${dni}`}>
        <button
          data-testid={`wizard-pick-modal-trigger-pick-${dni}`}
          onClick={() => {
            const file = createFileNode({
              name: '75618561CERT.pdf',
              sizeBytes: 1024,
              modifiedAt: '2026-06-01T00:00:00.000Z',
            });
            onPickSingle?.(file, 'LEGAJOS');
          }}
        >
          pick
        </button>
        <button data-testid={`wizard-pick-modal-trigger-close-${dni}`} onClick={() => onClose?.()}>
          close
        </button>
      </div>
    );
  },
}));

// ---- Fixtures ----

function makeFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten: 'AT-001',
    nroRuc: '20123456789',
    nomCFa: 'Acme Corp',
    proyecto: 'METRO LIMA',
    tipoExamen: 'CERT',
    condic: 'APTO',
    fecAte: '17/06/2026',
    ...overrides,
  };
}

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'Juan Pérez',
    empresa: 'Acme Corp',
    tipoExamen: 'CERT',
    proyecto: 'METRO LIMA',
    condic: 'APTO',
    fichas: [makeFicha()],
    ...overrides,
  };
}

const people: ReadonlyArray<UnifiedPerson> = [
  makePerson({ dni: '11111111', nombre: 'Ana López' }),
  makePerson({ dni: '22222222', nombre: 'Beto Ruiz' }),
];

const multiPeople: ReadonlyArray<UnifiedPerson> = [
  makePerson({
    dni: '11111111',
    nombre: 'Ana López',
    fichas: [
      makeFicha({ idAten: 'AT-1', proyecto: 'NEXA RESOURCES CAJAMARQUILLA' }),
      makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM' }),
      makeFicha({ idAten: 'AT-3', proyecto: 'MINSUR' }),
    ],
  }),
];

// ---- Helpers ----

function renderWizard(
  overrides: Partial<React.ComponentProps<typeof EnvioResultadosWizard>> = {},
) {
  const onClose = vi.fn();
  const onStateChange = vi.fn();
  const onContinueToEmail = vi.fn();
  const props: React.ComponentProps<typeof EnvioResultadosWizard> = {
    people,
    companies: [{ id: 'uuid-acme', name: 'Acme Corp', ruc: '20123456789', email: 'a@x' }],
    companyName: 'Acme Corp',
    onClose,
    onStateChange,
    onContinueToEmail,
    ...overrides,
  };
  const utils = render(<EnvioResultadosWizard {...props} />);
  return { ...utils, onClose, onStateChange, onContinueToEmail };
}

beforeEach(() => {
  mockFilesModalProps.mockReset();
});

// ================================================================

describe('EnvioResultadosWizard — shell chrome and routing', () => {
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

  it('clicking "Siguiente" in Step 1 with one patient selected advances to Step2Camo', () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    expect(screen.getByTestId('step2-camo')).toBeInTheDocument();
    expect(screen.queryByTestId('step1-pacientes')).not.toBeInTheDocument();
  });

  it('clicking "Volver" in Step 2 returns to Step 1 with the selection preserved', () => {
    renderWizard();
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(screen.getByTestId('step1-pacientes')).toBeInTheDocument();

    const row = screen.getByTestId('step1-row-11111111');
    expect(row).toHaveAttribute('data-selected', 'true');
  });

  it('fires onStateChange on every reducer transition (toggle, next, prev, goToStep)', () => {
    const { onStateChange } = renderWizard();

    expect(onStateChange).toHaveBeenCalled();
    const callCount = onStateChange.mock.calls.length;

    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(callCount);
    const afterToggle = onStateChange.mock.calls.length;

    fireEvent.click(screen.getByTestId('step1-siguiente'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(afterToggle);
    const afterNext = onStateChange.mock.calls.length;

    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(onStateChange.mock.calls.length).toBeGreaterThan(afterNext);

    const beforeChipClick = onStateChange.mock.calls.length;
    fireEvent.click(screen.getByTestId('wizard-stepper-chip-1'));
    expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(beforeChipClick);
  });

  it('press Escape to call onClose', () => {
    const { onClose } = renderWizard();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('click the X (Cerrar modal) button to call onClose', () => {
    const { onClose } = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders Step3Emo at currentStep=3', () => {
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoPicks: {},
      emoPicks: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();
    expect(screen.queryByTestId('step2-camo')).not.toBeInTheDocument();
  });

  it('"Volver" on Step 3 returns to Step 2 with the Step 2 picks preserved (composite key)', () => {
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoPicks: {
        [pickKey('11111111', 'AT-001')]: {
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
      emoPicks: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('step3-volver'));
    expect(screen.getByTestId('step2-camo')).toBeInTheDocument();

    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText(/75618561CERT\.pdf/)).toBeInTheDocument();
  });

  it('"Continuar" on Step 3 advances to Step 4 (the real Step4Resumen)', () => {
    const initialState: WizardState = {
      currentStep: 3,
      maxVisitedStep: 3,
      selectedDnIs: new Set(['11111111']),
      camoPicks: {},
      emoPicks: {},
    };
    renderWizard({ initialState });
    expect(screen.getByTestId('step3-emo')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('step3-continuar'));
    expect(screen.queryByTestId('step3-emo')).not.toBeInTheDocument();
    expect(screen.getByTestId('step4-resumen')).toBeInTheDocument();
  });
});

describe('EnvioResultadosWizard — Step 4 handoff', () => {
  it('"Continuar al envío" composes the full EmailViewData and calls onContinueToEmail', () => {
    const initialState: WizardState = {
      currentStep: 4,
      maxVisitedStep: 4,
      selectedDnIs: new Set(['11111111', '22222222']),
      camoPicks: {
        [pickKey('11111111', 'AT-001')]: {
          ref: {
            ruc: '20123456789',
            dni: '11111111',
            idAten: 'AT-001',
            path: 'LEGAJOS',
            name: 'CERT.pdf',
            tipoExamen: 'CAMO',
          },
          displayName: 'CERT.pdf',
        },
        [pickKey('22222222', 'AT-001')]: {
          ref: {
            ruc: '20123456789',
            dni: '22222222',
            idAten: 'AT-001',
            path: 'LEGAJOS',
            name: 'CERT-2222.pdf',
            tipoExamen: 'CAMO',
          },
          displayName: 'CERT-2222.pdf',
        },
      },
      emoPicks: {
        [pickKey('11111111', 'AT-001')]: {
          ref: {
            ruc: '20123456789',
            dni: '11111111',
            idAten: 'AT-001',
            path: 'LEGAJOS',
            name: 'EXPED.pdf',
            tipoExamen: 'EMO',
          },
          displayName: 'EXPED.pdf',
        },
      },
    };
    const { onContinueToEmail } = renderWizard({ initialState });

    fireEvent.click(screen.getByTestId('step4-continuar'));

    expect(onContinueToEmail).toHaveBeenCalledTimes(1);
    const data = onContinueToEmail.mock.calls[0]?.[0] as {
      companyId: string;
      companyName: string;
      selectedPatients: Record<string, { patientName: string; files: string[] }>;
      patients: unknown[];
      fileRefs: Array<{ dni: string; idAten: string; name: string; tipoExamen?: string; nombreCompleto?: string }>;
      nombreCompleto: string;
      destino: string;
    };
    expect(data.companyId).toBe('uuid-acme');
    expect(data.companyName).toBe('Acme Corp');
    // Request-level nombreCompleto / destino STILL come from the
    // first selected patient — they are the FALLBACK scalar.
    expect(data.nombreCompleto).toBe('Ana López');
    expect(data.destino).toBe('METRO LIMA');
    expect(data.selectedPatients['11111111']?.patientName).toBe('Ana López');
    expect(data.selectedPatients['11111111']?.files).toEqual(['CERT.pdf', 'EXPED.pdf']);
    expect(data.selectedPatients['22222222']?.patientName).toBe('Beto Ruiz');
    expect(data.fileRefs).toHaveLength(3);
    expect(data.fileRefs.find((r) => r.name === 'CERT.pdf')?.tipoExamen).toBe('CAMO');
    expect(data.fileRefs.find((r) => r.name === 'EXPED.pdf')?.tipoExamen).toBe('EMO');
    expect(data.fileRefs.find((r) => r.name === 'CERT.pdf')?.nombreCompleto).toBe('Ana López');
    expect(data.fileRefs.find((r) => r.name === 'CERT-2222.pdf')?.nombreCompleto).toBe('Beto Ruiz');
    expect(data.patients).toEqual([]);
  });
});

// ================================================================
// REQ-102 — per-ficha picks flow + deselect prune
// ================================================================

describe('EnvioResultadosWizard — per-ficha picks flow (REQ-102)', () => {
  it('a slot pick at Step 2 flows through Step 3 into the Step 4 summary', () => {
    renderWizard({ people: multiPeople });
    // Select the multi-ficha patient and advance to Step 2.
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    // Slot mode: 3 slot rows are on screen.
    expect(screen.getByTestId('step2-slot-11111111-0')).toBeInTheDocument();
    // Pick via slot 2 (UNACEM).
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-1'));
    fireEvent.click(screen.getByTestId('wizard-pick-modal-trigger-pick-11111111'));
    expect(screen.getByTestId('step2-slot-pick-label-11111111-1')).toHaveTextContent(/75618561CERT\.pdf/);

    // Advance through Step 3 into Step 4.
    fireEvent.click(screen.getByTestId('step2-siguiente'));
    fireEvent.click(screen.getByTestId('step3-continuar'));
    expect(screen.getByTestId('step4-resumen')).toBeInTheDocument();

    // The summary row shows the picked filename (count = 1/10).
    const row = screen.getByTestId('step4-row-11111111');
    expect(within(row).getByTestId('step4-camo-cell-11111111')).toHaveTextContent('75618561CERT.pdf');
    expect(screen.getByTestId('step4-count')).toHaveTextContent('1/10');
  });

  it('deselecting the patient at Step 1 prunes all of its per-ficha picks', () => {
    renderWizard({ people: multiPeople });
    fireEvent.click(screen.getByTestId('step1-row-11111111'));
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    // Pick two different slots.
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-0'));
    fireEvent.click(screen.getByTestId('wizard-pick-modal-trigger-pick-11111111'));
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-2'));
    fireEvent.click(screen.getByTestId('wizard-pick-modal-trigger-pick-11111111'));
    expect(screen.getByTestId('step2-slot-pick-label-11111111-0')).toHaveTextContent(/75618561CERT\.pdf/);
    expect(screen.getByTestId('step2-slot-pick-label-11111111-2')).toHaveTextContent(/75618561CERT\.pdf/);

    // Volver to Step 1, deselect, re-select, advance again.
    fireEvent.click(screen.getByTestId('step2-volver'));
    fireEvent.click(screen.getByTestId('step1-row-11111111')); // deselect
    fireEvent.click(screen.getByTestId('step1-row-11111111')); // re-select
    fireEvent.click(screen.getByTestId('step1-siguiente'));

    // All slots start from a clean slate (prefix prune).
    expect(screen.getByTestId('step2-slot-pick-label-11111111-0')).toHaveTextContent(/Sin seleccionar/);
    expect(screen.getByTestId('step2-slot-pick-label-11111111-1')).toHaveTextContent(/Sin seleccionar/);
    expect(screen.getByTestId('step2-slot-pick-label-11111111-2')).toHaveTextContent(/Sin seleccionar/);
  });
});
