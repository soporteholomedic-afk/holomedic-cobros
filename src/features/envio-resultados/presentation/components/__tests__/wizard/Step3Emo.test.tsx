/**
 * `Step3Emo` is the per-patient EMO picker. It is the mechanical
 * mirror of `Step2Camo` with `tipoExamen: 'EMO'` instead of `'CAMO'`.
 * The component renders one card per `dni` in `selectedDnIs` and,
 * on demand, opens a `FilesModal` overlay with `onPickSingle` callback.
 *
 * The "Siguiente" button is renamed to "Continuar" because step 3 is
 * the last step before the final summary (step 4). The callback
 * itself stays imperative (`onContinue`); the wizard shell wires it
 * to the same `NEXT` action as step 2.
 *
 * The actual `FilesModal` is stubbed here to keep the test focused
 * on `Step3Emo`'s wiring (the modal itself is covered by
 * `FilesModal.test.tsx`). The stub exposes one trigger button:
 *  - `step3-pick-modal-trigger-pick-{dni}` — fires `onPickSingle(file, folderPath)`
 *
 * Spec coverage:
 *  - REQ-006 — Step 3 EMO.
 *  - Scenarios S-010.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { createFileNode } from '@/features/envio-resultados/domain/ports';
import type { WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { Step3Emo } from '../../wizard/Step3Emo';
import type { UnifiedPerson } from '@/types/sp-result';

// ---- FilesModal stub ----
// Exposes one trigger button per open modal: simulates a file pick
// (calls onPickSingle with a FileNode and a folder path).
const mockFilesModalProps = vi.hoisted(() => vi.fn());
vi.mock('../../FilesModal', () => ({
  FilesModal: (props: Record<string, unknown>) => {
    mockFilesModalProps(props);
    const onPickSingle = props['onPickSingle'] as ((f: unknown, path: string) => void) | undefined;
    const onClose = props['onClose'] as (() => void) | undefined;
    const dni = String(props['dni'] ?? '');
    return (
      <div data-testid={`step3-pick-modal-${dni}`}>
        <span data-testid={`step3-pick-modal-onsingle-${dni}`}>
          {String(typeof props['onPickSingle'])}
        </span>
        <button
          data-testid={`step3-pick-modal-trigger-pick-${dni}`}
          onClick={() => {
            const file = createFileNode({
              name: '75618561EXPED.pdf',
              sizeBytes: 1024,
              modifiedAt: '2026-06-01T00:00:00.000Z',
            });
            onPickSingle?.(file, 'LEGAJOS');
          }}
        >
          pick
        </button>
        <button
          data-testid={`step3-pick-modal-trigger-close-${dni}`}
          onClick={() => onClose?.()}
        >
          close
        </button>
      </div>
    );
  },
}));

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
  makePerson({ dni: '33333333', nombre: 'Carla Soto' }),
];

// ---- Helpers ----

function renderStep3(
  overrides: Partial<React.ComponentProps<typeof Step3Emo>> = {},
) {
  const onPickFile = vi.fn();
  const onBack = vi.fn();
  const onContinue = vi.fn();
  const props: React.ComponentProps<typeof Step3Emo> = {
    people,
    selectedDnIs: new Set(['11111111', '22222222']),
    emoByDni: {},
    onPickFile,
    onBack,
    onContinue,
    ...overrides,
  };
  const utils = render(<Step3Emo {...props} />);
  return { ...utils, onPickFile, onBack, onContinue };
}

// Stateful variant — updates `emoByDni` whenever `onPickFile` is
// called, mirroring what the wizard shell would do. Used by tests
// that need to verify the card's *post-pick* visual.
function renderStep3Stateful(
  initialEmoByDni: Record<string, WizardFilePick> = {},
) {
  let emoByDni: Record<string, WizardFilePick> = { ...initialEmoByDni };
  const onPickFile = vi.fn((dni: string, pick: WizardFilePick) => {
    emoByDni = { ...emoByDni, [dni]: pick };
    rerender();
  });
  const onBack = vi.fn();
  const onContinue = vi.fn();
  const utils = render(
    <Step3Emo
      people={people}
      selectedDnIs={new Set(['11111111', '22222222'])}
      emoByDni={emoByDni}
      onPickFile={onPickFile}
      onBack={onBack}
      onContinue={onContinue}
    />,
  );
  function rerender(): void {
    utils.rerender(
      <Step3Emo
        people={people}
        selectedDnIs={new Set(['11111111', '22222222'])}
        emoByDni={emoByDni}
        onPickFile={onPickFile}
        onBack={onBack}
        onContinue={onContinue}
      />,
    );
  }
  return { ...utils, onPickFile, onBack, onContinue };
}

beforeEach(() => {
  mockFilesModalProps.mockReset();
});

// ================================================================

describe('Step3Emo', () => {
  it('renders one card per dni in selectedDnIs', () => {
    renderStep3();
    expect(screen.getByTestId('step3-card-11111111')).toBeInTheDocument();
    expect(screen.getByTestId('step3-card-22222222')).toBeInTheDocument();
    // The third person was not selected — no card.
    expect(screen.queryByTestId('step3-card-33333333')).not.toBeInTheDocument();
  });

  it('each card shows the patient name and DNI', () => {
    renderStep3();
    const card = screen.getByTestId('step3-card-11111111');
    expect(within(card).getByText('Ana López')).toBeInTheDocument();
    expect(within(card).getByText(/11111111/)).toBeInTheDocument();
  });

  it('clicking "Elegir EMO" opens the FilesModal with onPickSingle callback', () => {
    renderStep3();
    expect(screen.queryByTestId('step3-pick-modal-11111111')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));

    const modal = screen.getByTestId('step3-pick-modal-11111111');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByTestId('step3-pick-modal-onsingle-11111111')).toHaveTextContent('function');
  });

  it('picking a file via the modal calls onPickFile with a WizardFilePick { ref, displayName } for that dni', () => {
    const { onPickFile } = renderStep3();
    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, pick] = onPickFile.mock.calls[0] as [string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(pick).not.toBeNull();
    expect(pick?.displayName).toBe('75618561EXPED.pdf');
    expect(pick?.ref.dni).toBe('11111111');
    expect(pick?.ref.tipoExamen).toBe('EMO');
    expect(pick?.ref.name).toBe('75618561EXPED.pdf');
  });

  it('after a pick, the card shows the picked filename', () => {
    renderStep3Stateful();
    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-11111111'));
    // Modal closes on pick — re-query the card.
    const card = screen.getByTestId('step3-card-11111111');
    expect(within(card).getByText(/75618561EXPED\.pdf/)).toBeInTheDocument();
  });

  it('clicking "Saltar EMO" on a card calls onPickFile(dni, null) without opening the modal', () => {
    const { onPickFile } = renderStep3();
    fireEvent.click(within(screen.getByTestId('step3-card-22222222')).getByTestId('step3-saltar-emo'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('22222222', null);
    expect(screen.queryByTestId('step3-pick-modal-22222222')).not.toBeInTheDocument();
  });

  it('closing the modal without picking preserves the underlying pick state', () => {
    renderStep3({ emoByDni: { '11111111': null } });
    expect(
      within(screen.getByTestId('step3-card-11111111')).getByText(/Saltado/),
    ).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-close-11111111'));
    expect(
      within(screen.getByTestId('step3-card-11111111')).getByText(/Saltado/),
    ).toBeInTheDocument();
  });

  it('clicking "Volver" in the footer calls onBack', () => {
    const { onBack } = renderStep3();
    fireEvent.click(screen.getByTestId('step3-volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('clicking "Continuar" in the footer calls onContinue (advances to step 4)', () => {
    const { onContinue } = renderStep3();
    fireEvent.click(screen.getByTestId('step3-continuar'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
