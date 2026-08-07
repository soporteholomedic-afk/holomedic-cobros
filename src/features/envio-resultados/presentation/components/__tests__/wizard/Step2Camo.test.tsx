/**
 * `Step2Camo` renders one picker card per patient selected at Step 1.
 * The operator picks (or skips) a CAMO file per patient via a
 * `FilesModal` overlay with `onPickSingle` callback.
 *
 * The actual `FilesModal` is stubbed here to keep the test focused
 * on `Step2Camo`'s wiring (the modal itself is covered by
 * `FilesModal.test.tsx`). The stub exposes one trigger button:
 *  - `step2-pick-modal-trigger-pick-{dni}` — fires `onPickSingle(file, folderPath)`
 *
 * Spec coverage:
 *  - REQ-005 — Step 2 CAMO.
 *  - Scenarios S-006, S-007, S-008, S-009.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { createFileNode } from '@/features/envio-resultados/domain/ports';
import type { WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { Step2Camo } from '../../wizard/Step2Camo';
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
      <div data-testid={`step2-pick-modal-${dni}`}>
        <span data-testid={`step2-pick-modal-onsingle-${dni}`}>
          {String(typeof props['onPickSingle'])}
        </span>
        <button
          data-testid={`step2-pick-modal-trigger-pick-${dni}`}
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
        <button
          data-testid={`step2-pick-modal-trigger-close-${dni}`}
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

function renderStep2(
  overrides: Partial<React.ComponentProps<typeof Step2Camo>> = {},
) {
  const onPickFile = vi.fn();
  const onBack = vi.fn();
  const onNext = vi.fn();
  const props: React.ComponentProps<typeof Step2Camo> = {
    people,
    selectedDnIs: new Set(['11111111', '22222222']),
    camoByDni: {},
    onPickFile,
    onBack,
    onNext,
    ...overrides,
  };
  const utils = render(<Step2Camo {...props} />);
  return { ...utils, onPickFile, onBack, onNext };
}

// Stateful variant — updates `camoByDni` whenever `onPickFile` is
// called, mirroring what the wizard shell would do. Used by tests
// that need to verify the card's *post-pick* visual.
function renderStep2Stateful(
  initialCamoByDni: Record<string, WizardFilePick> = {},
) {
  let camoByDni: Record<string, WizardFilePick> = { ...initialCamoByDni };
  const onPickFile = vi.fn((dni: string, pick: WizardFilePick) => {
    camoByDni = { ...camoByDni, [dni]: pick };
    rerender();
  });
  const onBack = vi.fn();
  const onNext = vi.fn();
  const utils = render(
    <Step2Camo
      people={people}
      selectedDnIs={new Set(['11111111', '22222222'])}
      camoByDni={camoByDni}
      onPickFile={onPickFile}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  function rerender(): void {
    utils.rerender(
      <Step2Camo
        people={people}
        selectedDnIs={new Set(['11111111', '22222222'])}
        camoByDni={camoByDni}
        onPickFile={onPickFile}
        onBack={onBack}
        onNext={onNext}
      />,
    );
  }
  return { ...utils, onPickFile, onBack, onNext };
}

beforeEach(() => {
  mockFilesModalProps.mockReset();
});

// ================================================================

describe('Step2Camo', () => {
  it('renders one card per dni in selectedDnIs', () => {
    renderStep2();
    expect(screen.getByTestId('step2-card-11111111')).toBeInTheDocument();
    expect(screen.getByTestId('step2-card-22222222')).toBeInTheDocument();
    // The third person was not selected — no card.
    expect(screen.queryByTestId('step2-card-33333333')).not.toBeInTheDocument();
  });

  it('each card shows the patient name and DNI', () => {
    renderStep2();
    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText('Ana López')).toBeInTheDocument();
    expect(within(card).getByText(/11111111/)).toBeInTheDocument();
  });

  it('clicking "Elegir CAMO" opens the FilesModal with onPickSingle callback', () => {
    renderStep2();
    expect(screen.queryByTestId('step2-pick-modal-11111111')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));

    const modal = screen.getByTestId('step2-pick-modal-11111111');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByTestId('step2-pick-modal-onsingle-11111111')).toHaveTextContent('function');
  });

  it('picking a file via the modal calls onPickFile with a WizardFilePick { ref, displayName } for that dni', () => {
    const { onPickFile } = renderStep2();
    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, pick] = onPickFile.mock.calls[0] as [string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(pick).not.toBeNull();
    expect(pick?.displayName).toBe('75618561CERT.pdf');
    expect(pick?.ref.dni).toBe('11111111');
    expect(pick?.ref.tipoExamen).toBe('CAMO');
    expect(pick?.ref.name).toBe('75618561CERT.pdf');
  });

  it('after a pick, the card shows the picked filename', () => {
    renderStep2Stateful();
    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-11111111'));
    // Modal closes on pick — re-query the card.
    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText(/75618561CERT\.pdf/)).toBeInTheDocument();
  });

  it('clicking "Saltar CAMO" on a card calls onPickFile(dni, null) without opening the modal', () => {
    const { onPickFile } = renderStep2();
    fireEvent.click(within(screen.getByTestId('step2-card-22222222')).getByTestId('step2-saltar-camo'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('22222222', null);
    expect(screen.queryByTestId('step2-pick-modal-22222222')).not.toBeInTheDocument();
  });

  it('closing the modal without picking preserves the underlying pick state', () => {
    renderStep2({ camoByDni: { '11111111': null } });
    expect(
      within(screen.getByTestId('step2-card-11111111')).getByText(/Saltado/),
    ).toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-close-11111111'));
    expect(
      within(screen.getByTestId('step2-card-11111111')).getByText(/Saltado/),
    ).toBeInTheDocument();
  });

  it('clicking "Volver" in the footer calls onBack', () => {
    const { onBack } = renderStep2();
    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('clicking "Siguiente" in the footer calls onNext', () => {
    const { onNext } = renderStep2();
    fireEvent.click(screen.getByTestId('step2-siguiente'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
