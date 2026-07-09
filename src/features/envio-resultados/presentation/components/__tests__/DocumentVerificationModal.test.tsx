/**
 * Tests for `DocumentVerificationModal` (PR 2 of the document-verification-modal
 * change).
 *
 * Acceptance criteria are pulled from the spec scenarios in
 * `sdd/verificacion-documentos-modal/spec`:
 *  - The modal renders CAMO and EMO sections, each with one of
 *    COMPLETO / PARCIAL / VACIO.
 *  - "CAMO COMPLETOS" / "EMO COMPLETOS" banners appear when each section
 *    is COMPLETO (both can show simultaneously).
 *  - GENERAR CAMO / GENERAR EMO buttons appear ONLY for patients missing
 *    the document (i.e. on the `without[]` list). Patients who have the
 *    document are listed without a GENERAR button.
 *  - The modal closes via Escape key, backdrop click, and the explicit
 *    "Cerrar" footer button. All three call the same `onClose` callback.
 *
 * The modal is intentionally a thin renderer — all per-patient state
 * logic is owned by the pure `aggregateDocumentStatuses` helper
 * (tested separately in `aggregateDocumentStatuses.test.ts`). This file
 * asserts what the modal renders for each pre-aggregated state and
 * verifies the three close controls work.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import type { LegajosRowStatus } from '@/features/envio-resultados/presentation/hooks/useLegajosStatus';
import {
  DocumentVerificationModal,
  type DocumentVerificationModalProps,
} from '../DocumentVerificationModal';

// ---- Fixture helpers ----

function makeFicha(idAten: string, partial: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten,
    nroRuc: '20123456789',
    nomCFa: 'EMPRESA TEST SAC',
    proyecto: 'PROYECTO X',
    tipoExamen: 'EMO',
    condic: 'APTO',
    fecAte: '01/01/2026',
    ...partial,
  };
}

function makePerson(
  dni: string,
  nombre: string,
  fichas: UnifiedFicha[],
  partial: Partial<UnifiedPerson> = {},
): UnifiedPerson {
  return {
    dni,
    nombre,
    empresa: 'EMPRESA TEST SAC',
    tipoExamen: 'EMO',
    proyecto: 'PROYECTO X',
    condic: 'APTO',
    fichas,
    ...partial,
  };
}

function settledStatus(
  hasCamo: boolean,
  hasEmo: boolean,
): LegajosRowStatus {
  return { hasCamo, hasEmo, loading: false };
}

/**
 * Build the props the modal needs. Tests override `statuses` to drive
 * different coverage scenarios; `people` controls the per-patient rows.
 */
function renderModal(
  overrides: Partial<DocumentVerificationModalProps> = {},
): ReturnType<typeof render> {
  const props: DocumentVerificationModalProps = {
    statuses: {},
    people: [],
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<DocumentVerificationModal {...props} />);
}

/** Convenience: get the section element by heading (returns the
 *  section element so callers can pass it to `within(...)` or query
 *  it directly with `screen` helpers). */
function getSection(label: string): HTMLElement {
  return screen.getByTestId(`section-${label.toLowerCase()}`);
}

describe('DocumentVerificationModal', () => {
  // ================================================================
  // State headers per section
  // ================================================================

  describe('state headers per section', () => {
    it('renders CAMO: COMPLETO and EMO: VACIO when only CAMO is fully covered', () => {
      // Triangulation: mixed (one COMPLETO, one VACIO) — the most
      // common operator scenario after a partial batch run.
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, false),
        'ATE-2': settledStatus(true, false),
      };

      renderModal({ statuses, people });

      // CAMO section: COMPLETO state, no VACIO label, no PARCIAL label.
      const camoSection = getSection('CAMO');
      expect(within(camoSection).getByTestId('state-camo')).toHaveTextContent('COMPLETO');
      expect(within(camoSection).queryByTestId('state-camo-vacio')).not.toBeInTheDocument();
      expect(within(camoSection).queryByTestId('state-camo-parcial')).not.toBeInTheDocument();

      // EMO section: VACIO state.
      const emoSection = getSection('EMO');
      expect(within(emoSection).getByTestId('state-emo')).toHaveTextContent('VACIO');
      expect(within(emoSection).queryByTestId('state-emo-completo')).not.toBeInTheDocument();
      expect(within(emoSection).queryByTestId('state-emo-parcial')).not.toBeInTheDocument();
    });

    it('renders CAMO: PARCIAL and EMO: PARCIAL when coverage is mixed for both', () => {
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, false),   // ALICE has CAMO, not EMO
        'ATE-2': settledStatus(false, true),   // BOB has EMO, not CAMO
      };

      renderModal({ statuses, people });

      expect(within(getSection('CAMO')).getByTestId('state-camo')).toHaveTextContent('PARCIAL');
      expect(within(getSection('EMO')).getByTestId('state-emo')).toHaveTextContent('PARCIAL');
    });

    it('renders CAMO: VACIO and EMO: VACIO for the empty batch scenario', () => {
      // Spec: empty batch opens modal with both sections as VACIO.
      renderModal({ statuses: {}, people: [] });

      expect(within(getSection('CAMO')).getByTestId('state-camo')).toHaveTextContent('VACIO');
      expect(within(getSection('EMO')).getByTestId('state-emo')).toHaveTextContent('VACIO');
    });
  });

  // ================================================================
  // Completion banners
  // ================================================================

  describe('completion banners', () => {
    it('shows both "CAMO COMPLETOS" and "EMO COMPLETOS" banners when both sections are COMPLETO', () => {
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, true),
        'ATE-2': settledStatus(true, true),
      };

      renderModal({ statuses, people });

      const camoBanner = screen.getByTestId('banner-camo-completo');
      const emoBanner = screen.getByTestId('banner-emo-completo');
      expect(camoBanner).toHaveTextContent('CAMO COMPLETOS');
      expect(emoBanner).toHaveTextContent('EMO COMPLETOS');
      expect(camoBanner).toBeInTheDocument();
      expect(emoBanner).toBeInTheDocument();
    });

    it('shows only the "CAMO COMPLETOS" banner when CAMO is COMPLETO and EMO is PARCIAL', () => {
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, false),
        'ATE-2': settledStatus(true, true),
      };

      renderModal({ statuses, people });

      expect(screen.getByTestId('banner-camo-completo')).toBeInTheDocument();
      expect(screen.queryByTestId('banner-emo-completo')).not.toBeInTheDocument();
    });

    it('does not show either banner when both sections are VACIO', () => {
      // Spec edge case: nobody has any document → no banners.
      renderModal({ statuses: {}, people: [] });

      expect(screen.queryByTestId('banner-camo-completo')).not.toBeInTheDocument();
      expect(screen.queryByTestId('banner-emo-completo')).not.toBeInTheDocument();
    });
  });

  // ================================================================
  // Section body rendering (triangulation: empty section body, etc.)
  // ================================================================

  describe('section body rendering', () => {
    it('renders "Sin pacientes" empty state in each section when no people', () => {
      // Triangulation: empty batch. Both sections are VACIO and the
      // section body shows the "Sin pacientes" placeholder.
      renderModal({ statuses: {}, people: [] });

      expect(screen.getAllByText('Sin pacientes en este lote.')).toHaveLength(2);
    });

    it('renders the section heading "CAMO" and "EMO" in the header', () => {
      // Triangulation: section headings are always present regardless
      // of coverage state.
      renderModal({ statuses: {}, people: [] });

      const camoSection = getSection('CAMO');
      const emoSection = getSection('EMO');
      expect(within(camoSection).getByRole('heading', { name: 'CAMO' })).toBeInTheDocument();
      expect(within(emoSection).getByRole('heading', { name: 'EMO' })).toBeInTheDocument();
    });

    it('lists every patient in a COMPLETO section (no GENERAR buttons rendered)', () => {
      // Triangulation: COMPLETO section must list every patient, all
      // without a GENERAR button.
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
        makePerson('33333333', 'CARLOS', [makeFicha('ATE-3')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, true),
        'ATE-2': settledStatus(true, true),
        'ATE-3': settledStatus(true, true),
      };

      renderModal({ statuses, people });

      const camoSection = getSection('CAMO');
      const emoSection = getSection('EMO');

      // Both sections COMPLETO → all 3 patient rows in each.
      expect(within(camoSection).getByTestId('patient-row-11111111')).toBeInTheDocument();
      expect(within(camoSection).getByTestId('patient-row-22222222')).toBeInTheDocument();
      expect(within(camoSection).getByTestId('patient-row-33333333')).toBeInTheDocument();
      expect(within(emoSection).getByTestId('patient-row-11111111')).toBeInTheDocument();
      expect(within(emoSection).getByTestId('patient-row-22222222')).toBeInTheDocument();
      expect(within(emoSection).getByTestId('patient-row-33333333')).toBeInTheDocument();

      // No GENERAR buttons anywhere.
      expect(screen.queryByRole('button', { name: /GENERAR CAMO/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERAR EMO/ })).not.toBeInTheDocument();
    });
  });

  // ================================================================
  // Per-patient GENERAR buttons
  // ================================================================

  describe('per-patient GENERAR placeholders', () => {
    it('shows a GENERAR EMO button for a patient missing EMO (and no GENERAR CAMO since they have it)', () => {
      // ALICE has CAMO, no EMO → only GENERAR EMO is shown.
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, false),
      };

      renderModal({ statuses, people });

      const camoSection = getSection('CAMO');
      const emoSection = getSection('EMO');

      // In CAMO's `with[]`, ALICE has the document → no GENERAR CAMO button.
      const camoAliceRow = within(camoSection).getByTestId('patient-row-11111111');
      expect(within(camoAliceRow).queryByRole('button', { name: /GENERAR CAMO/ })).not.toBeInTheDocument();

      // In EMO's `without[]`, ALICE lacks the document → GENERAR EMO appears.
      const emoAliceRow = within(emoSection).getByTestId('patient-row-11111111');
      const generarEmo = within(emoAliceRow).getByRole('button', { name: /GENERAR EMO/ });
      expect(generarEmo).toBeInTheDocument();
    });

    it('shows a GENERAR CAMO button for a patient missing CAMO (and no GENERAR EMO since they have it)', () => {
      // BOB has EMO, no CAMO → only GENERAR CAMO is shown.
      const people: UnifiedPerson[] = [
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-2': settledStatus(false, true),
      };

      renderModal({ statuses, people });

      const camoSection = getSection('CAMO');
      const emoSection = getSection('EMO');

      const camoBobRow = within(camoSection).getByTestId('patient-row-22222222');
      const generarCamo = within(camoBobRow).getByRole('button', { name: /GENERAR CAMO/ });
      expect(generarCamo).toBeInTheDocument();

      const emoBobRow = within(emoSection).getByTestId('patient-row-22222222');
      expect(within(emoBobRow).queryByRole('button', { name: /GENERAR EMO/ })).not.toBeInTheDocument();
    });

    it('shows BOTH GENERAR CAMO and GENERAR EMO for a patient missing both documents', () => {
      const people: UnifiedPerson[] = [
        makePerson('33333333', 'CARLOS', [makeFicha('ATE-3')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-3': settledStatus(false, false),
      };

      renderModal({ statuses, people });

      // CARLOS is in CAMO's `without[]` → GENERAR CAMO.
      const camoCarlos = within(getSection('CAMO')).getByTestId('patient-row-33333333');
      expect(within(camoCarlos).getByRole('button', { name: /GENERAR CAMO/ })).toBeInTheDocument();

      // CARLOS is in EMO's `without[]` → GENERAR EMO.
      const emoCarlos = within(getSection('EMO')).getByTestId('patient-row-33333333');
      expect(within(emoCarlos).getByRole('button', { name: /GENERAR EMO/ })).toBeInTheDocument();
    });

    it('does NOT show any GENERAR button for patients who have the document (COMPLETO section)', () => {
      // All-have-both → both sections COMPLETO. No GENERAR buttons anywhere.
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, true),
        'ATE-2': settledStatus(true, true),
      };

      renderModal({ statuses, people });

      // Both sections COMPLETO → no GENERAR buttons at all.
      expect(screen.queryByRole('button', { name: /GENERAR CAMO/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERAR EMO/ })).not.toBeInTheDocument();
    });

    it('GENERAR buttons are clickable but perform no action (placeholder)', () => {
      // Triangulation: a real click should not throw and should not
      // mutate parent state (since onClick is the no-op `() => {}`).
      const people: UnifiedPerson[] = [
        makePerson('33333333', 'CARLOS', [makeFicha('ATE-3')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-3': settledStatus(false, false),
      };
      const onClose = vi.fn();

      renderModal({ statuses, people, onClose });

      const generarCamo = within(getSection('CAMO')).getByRole('button', { name: /GENERAR CAMO/ });
      const generarEmo = within(getSection('EMO')).getByRole('button', { name: /GENERAR EMO/ });

      expect(() => fireEvent.click(generarCamo)).not.toThrow();
      expect(() => fireEvent.click(generarEmo)).not.toThrow();

      // No-op: onClose should NOT have been called by the GENERAR click.
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Patient rows render with name and DNI
  // ================================================================

  describe('patient row content', () => {
    it('renders the patient name in the row', () => {
      const people: UnifiedPerson[] = [
        makePerson('11111111', 'ALICE GOMEZ', [makeFicha('ATE-1')]),
        makePerson('22222222', 'BOB DIAZ', [makeFicha('ATE-2')]),
      ];
      const statuses: Record<string, LegajosRowStatus> = {
        'ATE-1': settledStatus(true, false),
        'ATE-2': settledStatus(false, true),
      };

      renderModal({ statuses, people });

      // Both names appear once across both sections (each patient
      // shows up under their respective section's with/without list).
      expect(screen.getAllByText('ALICE GOMEZ').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('BOB DIAZ').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ================================================================
  // Close controls
  // ================================================================

  describe('close controls', () => {
    const peopleWithCoverage: UnifiedPerson[] = [
      makePerson('11111111', 'ALICE', [makeFicha('ATE-1')]),
    ];
    const statuses: Record<string, LegajosRowStatus> = {
      'ATE-1': settledStatus(true, true),
    };

    it('calls onClose when the Escape key is pressed', () => {
      const onClose = vi.fn();
      renderModal({ statuses, people: peopleWithCoverage, onClose });

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn();
      const { container } = renderModal({ statuses, people: peopleWithCoverage, onClose });

      const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the explicit "Cerrar" footer button is clicked', () => {
      const onClose = vi.fn();
      renderModal({ statuses, people: peopleWithCoverage, onClose });

      const closeBtn = screen.getByTestId('modal-close');
      expect(closeBtn).toHaveTextContent('Cerrar');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when clicking inside the modal card (stopPropagation)', () => {
      // Triangulation: backdrop click closes, but clicking the inner
      // card body must not. Verifies the stopPropagation handler.
      const onClose = vi.fn();
      const { container } = renderModal({ statuses, people: peopleWithCoverage, onClose });

      const card = container.querySelector('[role="dialog"]') as HTMLElement;
      expect(card).toBeTruthy();
      fireEvent.click(card);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Dialog semantics
  // ================================================================

  describe('dialog semantics', () => {
    it('renders with role="dialog" and a descriptive aria-label', () => {
      renderModal({
        statuses: {},
        people: [makePerson('11111111', 'ALICE', [makeFicha('ATE-1')])],
        onClose: vi.fn(),
      });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      // The aria-label is set on the inner card; it must mention the
      // verification purpose so screen-reader users get context.
      expect(dialog.getAttribute('aria-label')).toMatch(/verificaci/i);
    });
  });
});
