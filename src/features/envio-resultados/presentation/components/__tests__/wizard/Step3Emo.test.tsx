/**
 * `Step3Emo` is the per-patient EMO picker — the mechanical mirror
 * of `Step2Camo` with `tipoExamen: 'EMO'` (repo mirror convention).
 * Multi-proyecto change (REQ-102): a patient with ≥2 idAten-bearing
 * fichas renders one EMO slot row per ficha (proyecto label, own
 * FilesModal binding per atención); a patient with ≤1 slot renders
 * byte-identical to the legacy per-patient card (same testids).
 *
 * The "Siguiente" button is renamed to "Continuar" because step 3 is
 * the last step before the final summary (step 4). The callback
 * itself stays imperative (`onContinue`); the wizard shell wires it
 * to the same `NEXT` action as step 2.
 *
 * Spec coverage:
 *  - REQ-102 — per-ficha slots (S-102.1), legacy single-ficha (S-102.2).
 *  - Legacy REQ-006 — Step 3 EMO (S-010).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { createFileNode } from '@/features/envio-resultados/domain/ports';
import { pickKey, type WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import { Step3Emo } from '../../wizard/Step3Emo';
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

// ---- useAttachAllProyectos stub ----
// The quick-action hook is stubbed at the module boundary so these
// tests stay focused on Step3Emo's WIRING: button visibility
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
  emoPicks?: Record<string, WizardFilePick>;
}

function renderStep3({
  people: thePeople = people,
  selectedDnIs = new Set(['11111111', '22222222']),
  emoPicks = {},
}: RenderArgs = {}) {
  const onPickFile = vi.fn();
  const onBack = vi.fn();
  const onContinue = vi.fn();
  const onBatch = vi.fn();
  const props = {
    people: thePeople,
    selectedDnIs,
    emoPicks,
    onPickFile,
    onBatch,
    onBack,
    onContinue,
  };
  const utils = render(<Step3Emo {...props} />);
  return { ...utils, onPickFile, onBatch, onBack, onContinue };
}

// Stateful variant — updates `emoPicks` whenever `onPickFile` is
// called, mirroring what the wizard shell would do.
function renderStep3Stateful(
  args: RenderArgs = {},
  initialEmoPicks: Record<string, WizardFilePick> = {},
) {
  let emoPicks: Record<string, WizardFilePick> = { ...initialEmoPicks };
  const onPickFile = vi.fn((dni: string, idAten: string, pick: WizardFilePick) => {
    emoPicks = { ...emoPicks, [pickKey(dni, idAten)]: pick };
    rerender();
  });
  const onBack = vi.fn();
  const onContinue = vi.fn();
  const onBatch = vi.fn();
  const utils = render(
    <Step3Emo
      people={args.people ?? people}
      selectedDnIs={args.selectedDnIs ?? new Set(['11111111', '22222222'])}
      emoPicks={emoPicks}
      onPickFile={onPickFile}
      onBatch={onBatch}
      onBack={onBack}
      onContinue={onContinue}
    />,
  );
  function rerender(): void {
    utils.rerender(
      <Step3Emo
        people={args.people ?? people}
        selectedDnIs={args.selectedDnIs ?? new Set(['11111111', '22222222'])}
        emoPicks={emoPicks}
        onPickFile={onPickFile}
        onBatch={onBatch}
        onBack={onBack}
        onContinue={onContinue}
      />,
    );
  }
  return { ...utils, onPickFile, onBatch, onBack, onContinue };
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

describe('Step3Emo — legacy single-ficha render (S-102.2)', () => {
  it('renders one legacy card per dni in selectedDnIs (same testids as today)', () => {
    renderStep3();
    expect(screen.getByTestId('step3-card-11111111')).toBeInTheDocument();
    expect(screen.getByTestId('step3-card-22222222')).toBeInTheDocument();
    expect(screen.queryByTestId('step3-card-33333333')).not.toBeInTheDocument();
    expect(screen.getByTestId('step3-pick-label-11111111')).toBeInTheDocument();
    expect(screen.queryByTestId('step3-slot-11111111-0')).not.toBeInTheDocument();
  });

  it('each card shows the patient name and DNI, with no proyecto label row', () => {
    renderStep3();
    const card = screen.getByTestId('step3-card-11111111');
    expect(within(card).getByText('Ana López')).toBeInTheDocument();
    expect(within(card).getByText(/11111111/)).toBeInTheDocument();
    expect(within(card).queryByTestId('step3-slot-label-11111111-0')).not.toBeInTheDocument();
  });

  it('shows the picked filename read from the composite pick key', () => {
    renderStep3({
      emoPicks: { [pickKey('11111111', 'AT-001')]: { ref: { ruc: '20123456789', dni: '11111111', idAten: 'AT-001', path: 'LEGAJOS', name: 'EXPED.pdf', tipoExamen: 'EMO' }, displayName: 'EXPED.pdf' } },
    });
    const card = screen.getByTestId('step3-card-11111111');
    expect(within(card).getByText(/EXPED\.pdf/)).toBeInTheDocument();
  });

  it('clicking "Saltar EMO" calls onPickFile(dni, ficha.idAten, null) without opening the modal', () => {
    const { onPickFile } = renderStep3();
    fireEvent.click(within(screen.getByTestId('step3-card-22222222')).getByTestId('step3-saltar-emo'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('22222222', 'AT-001', null);
    expect(screen.queryByTestId('step3-pick-modal-22222222')).not.toBeInTheDocument();
  });

  it('opens the FilesModal bound to the single ficha (idAten/fecAte) on "Elegir EMO"', () => {
    renderStep3();
    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));
    expect(screen.getByTestId('step3-pick-modal-11111111')).toBeInTheDocument();
    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1]?.[0];
    expect(lastProps?.['idAten']).toBe('AT-001');
    expect(lastProps?.['fecAte']).toBe('17/06/2026');
  });

  it('picking via the modal calls onPickFile(dni, idAten, pick) stamped EMO', () => {
    const { onPickFile } = renderStep3();
    fireEvent.click(within(screen.getByTestId('step3-card-11111111')).getByTestId('step3-elegir-emo'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(idAten).toBe('AT-001');
    expect(pick?.ref.idAten).toBe('AT-001');
    expect(pick?.ref.ruc).toBe('20123456789');
    expect(pick?.ref.tipoExamen).toBe('EMO');
  });

  it('footer buttons keep calling onBack / onContinue', () => {
    const { onBack, onContinue } = renderStep3();
    fireEvent.click(screen.getByTestId('step3-volver'));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('step3-continuar'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('Step3Emo — per-ficha slots (S-102.1)', () => {
  const multi = makeMultiProyectoPerson();

  it('renders one EMO slot row per ficha with proyecto labels', () => {
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step3-slot-11111111-0')).toBeInTheDocument();
    expect(screen.getByTestId('step3-slot-11111111-1')).toBeInTheDocument();
    expect(screen.getByTestId('step3-slot-11111111-2')).toBeInTheDocument();
    expect(screen.getByTestId('step3-slot-label-11111111-0')).toHaveTextContent('NEXA RESOURCES CAJAMARQUILLA');
    expect(screen.getByTestId('step3-slot-label-11111111-1')).toHaveTextContent('UNACEM');
    expect(screen.getByTestId('step3-slot-label-11111111-2')).toHaveTextContent('MINSUR');
  });

  it('shows the fallback label when a ficha proyecto is empty', () => {
    const fallbackPerson = makePerson({
      dni: '22222222',
      nombre: 'Beto Ruiz',
      fichas: [makeFicha({ idAten: 'AT-1', proyecto: '' }), makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM' })],
    });
    renderStep3({ people: [fallbackPerson], selectedDnIs: new Set(['22222222']) });
    expect(screen.getByTestId('step3-slot-label-22222222-0')).toHaveTextContent('Atención AT-1');
  });

  it('picking via slot 2 records a (dni, idAten2)-keyed pick bound to ficha-2', () => {
    const { onPickFile } = renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step3-slot-elegir-11111111-1'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-11111111'));

    expect(onPickFile).toHaveBeenCalledTimes(1);
    const [dni, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(dni).toBe('11111111');
    expect(idAten).toBe('AT-2');
    expect(pick?.ref.idAten).toBe('AT-2');
    expect(pick?.ref.tipoExamen).toBe('EMO');
  });

  it('opens the FilesModal bound to ficha-2 values (idAten/fecAte)', () => {
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step3-slot-elegir-11111111-1'));

    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1]?.[0];
    expect(lastProps?.['idAten']).toBe('AT-2');
    expect(lastProps?.['fecAte']).toBe('02/07/2026');
  });

  it('derives the pick tipoExamen from THE SLOT ficha (ADICIONAL limitation fix)', () => {
    const mixedPerson = makePerson({
      dni: '22222222',
      nombre: 'Beto Ruiz',
      fichas: [
        makeFicha({ idAten: 'AT-1', tipoExamen: 'CERT' }),
        makeFicha({ idAten: 'AT-2', tipoExamen: 'ADICIONALES' }),
      ],
    });
    const { onPickFile } = renderStep3({ people: [mixedPerson], selectedDnIs: new Set(['22222222']) });
    fireEvent.click(screen.getByTestId('step3-slot-elegir-22222222-1'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-22222222'));

    const [, idAten, pick] = onPickFile.mock.calls[0] as [string, string, WizardFilePick];
    expect(idAten).toBe('AT-2');
    expect(pick?.ref.tipoExamen).toBe('ADICIONAL');
  });

  it('slot "Saltar" calls onPickFile(dni, slotIdAten, null) without opening the modal', () => {
    const { onPickFile } = renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step3-slot-saltar-11111111-2'));
    expect(onPickFile).toHaveBeenCalledTimes(1);
    expect(onPickFile).toHaveBeenCalledWith('11111111', 'AT-3', null);
    expect(screen.queryByTestId('step3-pick-modal-11111111')).not.toBeInTheDocument();
  });

  it('after a slot pick, that slot shows the filename and the others stay "Sin seleccionar"', () => {
    renderStep3Stateful({ people: [multi], selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step3-slot-elegir-11111111-1'));
    fireEvent.click(screen.getByTestId('step3-pick-modal-trigger-pick-11111111'));

    expect(screen.getByTestId('step3-slot-pick-label-11111111-1')).toHaveTextContent(/75618561EXPED\.pdf/);
    expect(screen.getByTestId('step3-slot-pick-label-11111111-0')).toHaveTextContent(/Sin seleccionar/);
    expect(screen.getByTestId('step3-slot-pick-label-11111111-2')).toHaveTextContent(/Sin seleccionar/);
  });
});

// ================================================================

describe('Step3Emo — attach-all quick action (REQ-103)', () => {
  it('renders the quick action only for multi-ficha patients (S-103.3: hidden for single-ficha)', () => {
    const multi = makeMultiProyectoPerson();
    renderStep3({
      people: [multi, people[1] as UnifiedPerson],
      selectedDnIs: new Set(['11111111', '22222222']),
    });
    expect(screen.getByTestId('step3-attach-all-11111111')).toBeInTheDocument();
    expect(screen.queryByTestId('step3-attach-all-22222222')).not.toBeInTheDocument();
  });

  it('runs the quick action with slotKind "emo" for THAT patient only', () => {
    const multi = makeMultiProyectoPerson();
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    // The EMO step must instantiate the hook for the EMO slot kind
    // (mirror-drift guard: a copy-paste from Step2 would say 'camo').
    expect(mockUseAttachAllProyectos).toHaveBeenCalledWith(
      expect.objectContaining({ slotKind: 'emo' }),
    );
    fireEvent.click(screen.getByTestId('step3-attach-all-11111111'));
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
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step3-slot-status-11111111-0')).toHaveTextContent('Buscando');
    expect(screen.getByTestId('step3-slot-status-11111111-1')).toHaveTextContent('Adjuntado');
    expect(screen.getByTestId('step3-slot-status-11111111-2')).toHaveTextContent('Ambiguo');
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
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step3-slot-status-11111111-0')).toHaveTextContent('HTTP 500');
    expect(screen.queryByTestId('step3-slot-status-11111111-1')).not.toBeInTheDocument();
  });

  it('disables the quick action while a quick-action run is in flight', () => {
    mockUseAttachAllProyectos.mockReturnValue({
      attachAll: mockAttachAll,
      slotStatus: {},
      isRunning: true,
    });
    const multi = makeMultiProyectoPerson();
    renderStep3({ people: [multi], selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step3-attach-all-11111111')).toBeDisabled();
  });
});
