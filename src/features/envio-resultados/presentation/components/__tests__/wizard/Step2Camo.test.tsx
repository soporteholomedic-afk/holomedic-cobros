/**
 * `Step2Camo` renders one picker card per patient selected at Step 1.
 * Multi-proyecto change (REQ-102): a patient with ≥2 idAten-bearing
 * fichas renders one CAMO slot row per ficha (proyecto label, own
 * FilesModal binding per atención); a patient with ≤1 slot renders
 * byte-identical to the legacy per-patient card (same testids).
 *
 * The actual `FilesModal` is stubbed here to keep the test focused
 * on `Step2Camo`'s wiring (the modal itself is covered by
 * `FilesModal.test.tsx`). The stub exposes one trigger button:
 *  - `step2-pick-modal-trigger-pick-{dni}` — fires `onPickSingle(file, folderPath)`
 *
 * Spec coverage:
 *  - REQ-102 — per-ficha slots (S-102.1), legacy single-ficha (S-102.2).
 *  - Legacy REQ-005 — Step 2 CAMO (S-006, S-007, S-008, S-009).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { createFileNode } from '@/features/envio-resultados/domain/ports';
import { pickKey, type WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { Step2Camo } from '../../wizard/Step2Camo';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';

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

// ---- useAttachAllProyectos stub ----
// The quick-action hook is stubbed at the module boundary so these
// tests stay focused on Step2Camo's WIRING: button visibility
// (S-103.3), click pass-through and per-slot status render. The
// hook's own behavior — listing fan-out, candidate rule, batching —
// is covered by `useAttachAllProyectos.test.ts`.
const mockAttachAll = vi.hoisted(() => vi.fn());
const mockUseAttachAllProyectos = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useAttachAllProyectos', () => ({
  useAttachAllProyectos: mockUseAttachAllProyectos,
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

/** Reference-case patient: 3 idAten-bearing fichas (NEXA/UNACEM/MINSUR). */
function makeMultiProyectoPerson(): UnifiedPerson {
  return makePerson({
    dni: '11111111',
    nombre: 'Ana López',
    fichas: [
      makeFicha({ idAten: 'AT-1', proyecto: 'NEXA RESOURCES CAJAMARQUILLA', fecAte: '01/07/2026' }),
      makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM', fecAte: '02/07/2026' }),
      makeFicha({ idAten: 'AT-3', proyecto: 'MINSUR', fecAte: '03/07/2026' }),
    ],
  });
}

const people: ReadonlyArray<UnifiedPerson> = [
  makePerson({ dni: '11111111', nombre: 'Ana López' }),
  makePerson({ dni: '22222222', nombre: 'Beto Ruiz' }),
  makePerson({ dni: '33333333', nombre: 'Carla Soto' }),
];

// ---- Helpers ----

interface RenderArgs {
  people?: ReadonlyArray<UnifiedPerson>;
  selectedDnIs?: ReadonlySet<string>;
  camoPicks?: Record<string, WizardFilePick>;
}

function renderStep2({
  people: thePeople = people,
  selectedDnIs = new Set(['11111111', '22222222']),
  camoPicks = {},
}: RenderArgs = {}) {
  const onPickFile = vi.fn();
  const onBack = vi.fn();
  const onNext = vi.fn();
  const onBatch = vi.fn();
  const props = {
    people: thePeople,
    selectedDnIs,
    camoPicks,
    onPickFile,
    onBatch,
    onBack,
    onNext,
  };
  const utils = render(<Step2Camo {...props} />);
  return { ...utils, onPickFile, onBatch, onBack, onNext };
}

// Stateful variant — updates `camoPicks` whenever `onPickFile` is
// called, mirroring what the wizard shell would do. Used by tests
// that need to verify the card's *post-pick* visual.
function renderStep2Stateful(
  args: RenderArgs = {},
  initialCamoPicks: Record<string, WizardFilePick> = {},
) {
  let camoPicks: Record<string, WizardFilePick> = { ...initialCamoPicks };
  const onPickFile = vi.fn((dni: string, idAten: string, pick: WizardFilePick) => {
    camoPicks = { ...camoPicks, [pickKey(dni, idAten)]: pick };
    rerender();
  });
  const onBack = vi.fn();
  const onNext = vi.fn();
  const onBatch = vi.fn();
  const utils = render(
    <Step2Camo
      people={args.people ?? people}
      selectedDnIs={args.selectedDnIs ?? new Set(['11111111', '22222222'])}
      camoPicks={camoPicks}
      onPickFile={onPickFile}
      onBatch={onBatch}
      onBack={onBack}
      onNext={onNext}
    />,
  );
  function rerender(): void {
    utils.rerender(
      <Step2Camo
        people={args.people ?? people}
        selectedDnIs={args.selectedDnIs ?? new Set(['11111111', '22222222'])}
        camoPicks={camoPicks}
        onPickFile={onPickFile}
        onBatch={onBatch}
        onBack={onBack}
        onNext={onNext}
      />,
    );
  }
  return { ...utils, onPickFile, onBatch, onBack, onNext };
}

beforeEach(() => {
  mockFilesModalProps.mockReset();
  mockAttachAll.mockReset();
  mockUseAttachAllProyectos.mockReset();
  mockUseAttachAllProyectos.mockReturnValue({
    attachAll: mockAttachAll,
    slotStatus: {},
    isRunning: false,
  });
});

// ================================================================

describe('Step2Camo — legacy single-ficha render (S-102.2)', () => {
  it('renders one legacy card per dni in selectedDnIs (same testids as today)', () => {
    renderStep2();
    expect(screen.getByTestId('step2-card-11111111')).toBeInTheDocument();
    expect(screen.getByTestId('step2-card-22222222')).toBeInTheDocument();
    // The third person was not selected — no card.
    expect(screen.queryByTestId('step2-card-33333333')).not.toBeInTheDocument();
    // Legacy pick-label testids are present; NO slot testids.
    expect(screen.getByTestId('step2-pick-label-11111111')).toBeInTheDocument();
    expect(screen.queryByTestId('step2-slot-11111111-0')).not.toBeInTheDocument();
  });

  it('each card shows the patient name and DNI, with no proyecto label row', () => {
    renderStep2();
    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText('Ana López')).toBeInTheDocument();
    expect(within(card).getByText(/11111111/)).toBeInTheDocument();
    // Byte-identical legacy card: no per-slot label element.
    expect(within(card).queryByTestId('step2-slot-label-11111111-0')).not.toBeInTheDocument();
  });

  it('shows the picked filename read from the composite pick key', () => {
    renderStep2({
      camoPicks: { [pickKey('11111111', 'AT-001')]: { ref: { ruc: '20123456789', dni: '11111111', idAten: 'AT-001', path: 'LEGAJOS', name: 'CERT.pdf', tipoExamen: 'CAMO' }, displayName: 'CERT.pdf' } },
    });
    const card = screen.getByTestId('step2-card-11111111');
    expect(within(card).getByText(/CERT\.pdf/)).toBeInTheDocument();
  });

  it('clicking "Saltar CAMO" calls onPickFile(dni, ficha.idAten, null) without opening the modal', () => {
    const { onPickFile } = renderStep2();
    fireEvent.click(within(screen.getByTestId('step2-card-22222222')).getByTestId('step2-saltar-camo'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('22222222', 'AT-001', null);
    expect(screen.queryByTestId('step2-pick-modal-22222222')).not.toBeInTheDocument();
  });

  it('opens the FilesModal bound to the single ficha (idAten/fecAte) on "Elegir CAMO"', () => {
    renderStep2();
    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));
    expect(screen.getByTestId('step2-pick-modal-11111111')).toBeInTheDocument();
    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1]?.[0];
    expect(lastProps?.['idAten']).toBe('AT-001');
    expect(lastProps?.['fecAte']).toBe('17/06/2026');
  });

  it('picking via the modal calls onPickFile(dni, idAten, pick) with ref bound to that ficha', () => {
    const { onPickFile } = renderStep2();
    fireEvent.click(within(screen.getByTestId('step2-card-11111111')).getByTestId('step2-elegir-camo'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(idAten).toBe('AT-001');
    expect(pick).not.toBeNull();
    expect(pick?.displayName).toBe('75618561CERT.pdf');
    expect(pick?.ref.dni).toBe('11111111');
    expect(pick?.ref.idAten).toBe('AT-001');
    // The ref keeps the RAW ficha nroRuc (only the modal view resolves it).
    expect(pick?.ref.ruc).toBe('20123456789');
    expect(pick?.ref.tipoExamen).toBe('CAMO');
  });

  it('a patient whose fichas all lack idAten still renders the legacy card', () => {
    const noIdAten = makePerson({ dni: '44444444', nombre: 'Diana Flores', fichas: [makeFicha({ idAten: '' })] });
    renderStep2({
      people: [noIdAten],
      selectedDnIs: new Set(['44444444']),
    });
    expect(screen.getByTestId('step2-card-44444444')).toBeInTheDocument();
    expect(within(screen.getByTestId('step2-card-44444444')).getByText(/Sin seleccionar/)).toBeInTheDocument();
  });

  it('footer buttons keep calling onBack / onNext', () => {
    const { onBack, onNext } = renderStep2();
    fireEvent.click(screen.getByTestId('step2-volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('step2-siguiente'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('Step2Camo — per-ficha slots (S-102.1)', () => {
  const multi = makeMultiProyectoPerson();

  it('renders one CAMO slot row per ficha with proyecto labels', () => {
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step2-slot-11111111-0')).toBeInTheDocument();
    expect(screen.getByTestId('step2-slot-11111111-1')).toBeInTheDocument();
    expect(screen.getByTestId('step2-slot-11111111-2')).toBeInTheDocument();
    expect(screen.getByTestId('step2-slot-label-11111111-0')).toHaveTextContent('NEXA RESOURCES CAJAMARQUILLA');
    expect(screen.getByTestId('step2-slot-label-11111111-1')).toHaveTextContent('UNACEM');
    expect(screen.getByTestId('step2-slot-label-11111111-2')).toHaveTextContent('MINSUR');
  });

  it('shows the fallback label when a ficha proyecto is empty', () => {
    const fallbackPerson = makePerson({
      dni: '22222222',
      nombre: 'Beto Ruiz',
      fichas: [makeFicha({ idAten: 'AT-1', proyecto: '' }), makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM' })],
    });
    renderStep2({ people: [fallbackPerson], selectedDnIs: new Set(['22222222']) });
    expect(screen.getByTestId('step2-slot-label-22222222-0')).toHaveTextContent('Atención AT-1');
    expect(screen.getByTestId('step2-slot-label-22222222-1')).toHaveTextContent('UNACEM');
  });

  it('picking via slot 2 records a (dni, idAten2)-keyed pick', () => {
    const { onPickFile } = renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-1'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(idAten).toBe('AT-2');
    expect(pick?.ref.idAten).toBe('AT-2');
    expect(pick?.displayName).toBe('75618561CERT.pdf');
  });

  it('opens the FilesModal bound to ficha-2 values (idAten/fecAte/nombrePaciente)', () => {
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-1'));

    expect(screen.getByTestId('step2-pick-modal-11111111')).toBeInTheDocument();
    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1]?.[0];
    expect(lastProps?.['idAten']).toBe('AT-2');
    expect(lastProps?.['fecAte']).toBe('02/07/2026');
    expect(lastProps?.['nombrePaciente']).toBe('Ana López');
  });

  it('derives the pick tipoExamen from THE SLOT ficha, not fichas[0] (ADICIONAL limitation fix)', () => {
    const mixedPerson = makePerson({
      dni: '22222222',
      nombre: 'Beto Ruiz',
      fichas: [
        makeFicha({ idAten: 'AT-1', tipoExamen: 'CERT' }),
        makeFicha({ idAten: 'AT-2', tipoExamen: 'ADICIONALES' }),
      ],
    });
    const { onPickFile } = renderStep2({ people: [mixedPerson], selectedDnIs: new Set(['22222222']) });
    fireEvent.click(screen.getByTestId('step2-slot-elegir-22222222-1'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-22222222'));

    const [, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(idAten).toBe('AT-2');
    expect(pick?.ref.tipoExamen).toBe('ADICIONAL');
  });

  it('slot "Saltar" calls onPickFile(dni, slotIdAten, null) without opening the modal', () => {
    const { onPickFile } = renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step2-slot-saltar-11111111-2'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('11111111', 'AT-3', null);
    expect(screen.queryByTestId('step2-pick-modal-11111111')).not.toBeInTheDocument();
  });

  it('after a slot pick, that slot shows the filename and the others stay "Sin seleccionar"', () => {
    renderStep2Stateful(
      { people: [multi], selectedDnIs: new Set(['11111111']) },
    );
    fireEvent.click(screen.getByTestId('step2-slot-elegir-11111111-1'));
    fireEvent.click(screen.getByTestId('step2-pick-modal-trigger-pick-11111111'));

    const pickedSlot = screen.getByTestId('step2-slot-pick-label-11111111-1');
    expect(pickedSlot).toHaveTextContent(/75618561CERT\.pdf/);
    expect(screen.getByTestId('step2-slot-pick-label-11111111-0')).toHaveTextContent(/Sin seleccionar/);
    expect(screen.getByTestId('step2-slot-pick-label-11111111-2')).toHaveTextContent(/Sin seleccionar/);
  });

  it('a Saltar slot shows "Saltado" via the stateful re-render', () => {
    renderStep2Stateful({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step2-slot-saltar-11111111-0'));
    expect(screen.getByTestId('step2-slot-pick-label-11111111-0')).toHaveTextContent(/Saltado/);
  });
});

// ================================================================

describe('Step2Camo — attach-all quick action (REQ-103)', () => {
  it('renders the quick action only for multi-ficha patients (S-103.3: hidden for single-ficha)', () => {
    const multi = makeMultiProyectoPerson();
    renderStep2({
      people: [multi, people[1] as UnifiedPerson],
      selectedDnIs: new Set(['11111111', '22222222']),
    });
    // Multi-ficha patient: the per-patient quick action exists.
    expect(screen.getByTestId('step2-attach-all-11111111')).toBeInTheDocument();
    // Single-ficha patient: NO quick action (per-patient only, no global action).
    expect(screen.queryByTestId('step2-attach-all-22222222')).not.toBeInTheDocument();
  });

  it('clicking the quick action runs attachAll for THAT patient only', () => {
    const multi = makeMultiProyectoPerson();
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step2-attach-all-11111111'));
    expect(mockAttachAll).toHaveBeenCalledTimes(1);
    expect(mockAttachAll).toHaveBeenCalledWith(
      expect.objectContaining({ dni: '11111111', nombre: 'Ana López' }),
    );
  });

  it('renders per-slot quick-action statuses: pending, applied, ambiguous', () => {
    mockUseAttachAllProyectos.mockReturnValue({
      attachAll: mockAttachAll,
      slotStatus: {
        '11111111::AT-1': { kind: 'pending' },
        '11111111::AT-2': { kind: 'applied' },
        '11111111::AT-3': { kind: 'ambiguous' },
      },
      isRunning: false,
    });
    const multi = makeMultiProyectoPerson();
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step2-slot-status-11111111-0')).toHaveTextContent('Buscando');
    expect(screen.getByTestId('step2-slot-status-11111111-1')).toHaveTextContent('Adjuntado');
    expect(screen.getByTestId('step2-slot-status-11111111-2')).toHaveTextContent('Ambiguo');
  });

  it('renders a slot error status with its message', () => {
    mockUseAttachAllProyectos.mockReturnValue({
      attachAll: mockAttachAll,
      slotStatus: {
        '11111111::AT-1': { kind: 'error', message: 'HTTP 500' },
      },
      isRunning: false,
    });
    const multi = makeMultiProyectoPerson();
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step2-slot-status-11111111-0')).toHaveTextContent('HTTP 500');
    // Slots without a status render none.
    expect(screen.queryByTestId('step2-slot-status-11111111-1')).not.toBeInTheDocument();
  });

  it('disables the quick action while a quick-action run is in flight', () => {
    mockUseAttachAllProyectos.mockReturnValue({
      attachAll: mockAttachAll,
      slotStatus: {},
      isRunning: true,
    });
    const multi = makeMultiProyectoPerson();
    renderStep2({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step2-attach-all-11111111')).toBeDisabled();
  });
});
