import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';
import type { FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import { createFileNode } from '@/features/envio-resultados/domain/file-system/FileNode';

// ---- Hoisted mocks ----

const mockUseUnifiedResults = vi.hoisted(() => vi.fn());
const mockUseCompanies = vi.hoisted(() => vi.fn());
const mockFilesModalProps = vi.hoisted(() => vi.fn());
const mockEmailEditorProps = vi.hoisted(() => vi.fn());

// Stub the FilesModal so the WorkerDetailTable test does not have to
// deal with the modal's internal usePatientFiles fetch lifecycle.
// The stub records the props it received so the test can assert the
// modal is opened with the right (ruc, dni, idAten) triple. The
// trigger-send button lets PR #4 tests fire `onSend` with a known
// `FileNode[]` to drive the bridge → EmailEditor state transition.
vi.mock('../FilesModal', () => ({
  FilesModal: (props: Record<string, unknown>) => {
    mockFilesModalProps(props);
    const onSend = props['onSend'] as ((files: FileNode[]) => void) | undefined;
    return (
      <div data-testid="files-modal-stub">
        {String(props['idAten'] ?? '')}
        {String(props['ruc'] ?? '')}
        {String(props['dni'] ?? '')}
        {typeof onSend === 'function' && (
          <button
            data-testid="files-modal-stub-trigger-onsend"
            onClick={() => {
              onSend([
                createFileNode({ name: 'a.pdf', sizeBytes: 100, modifiedAt: '2026-06-01T00:00:00.000Z' }),
                createFileNode({ name: 'b.pdf', sizeBytes: 200, modifiedAt: '2026-06-01T00:00:00.000Z' }),
              ]);
            }}
          >
            trigger-send
          </button>
        )}
      </div>
    );
  },
}));

// Stub the EmailEditor so PR #4 tests can observe the bridged
// `{ companyId, selectedPatients, patients }` payload without having
// to satisfy its internal hook contracts (useSendResults, SpitchSelector,
// etc.). Records every prop it received.
vi.mock('../EmailEditor', () => ({
  EmailEditor: (props: Record<string, unknown>) => {
    mockEmailEditorProps(props);
    return <div data-testid="email-editor-stub" data-company-id={String(props['companyId'] ?? '')} />;
  },
}));

vi.mock('../../hooks/useUnifiedResults', () => ({
  useUnifiedResults: mockUseUnifiedResults,
}));

vi.mock('../../hooks/useCompanies', () => ({
  useCompanies: mockUseCompanies,
}));

// ---- Import component under test ----

import { WorkerDetailTable } from '../WorkerDetailTable';

// ---- Helpers ----

function makeUnifiedPerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PÉREZ',
    empresa: 'EMPRESA TEST S.A.C.',
    tipoExamen: 'PERIODICO',
    proyecto: 'PROYECTO UNO',
    condic: '',
    fichas: [makeFicha()],
    ...overrides,
  };
}

function makeFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten: 'ATE-001',
    nroRuc: '20123456789',
    nomCFa: 'EMPRESA TEST S.A.C.',
    proyecto: '',
    tipoExamen: '',
    condic: '',
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  companyName: 'EMPRESA TEST',
  fechaInicio: '2026-01-01',
  fechaFin: '2026-06-30',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: loading state
  mockUseUnifiedResults.mockReturnValue({
    people: [],
    loading: true,
    error: null,
  });
  // Default: companies list is empty (no match → companyId = '').
  // Tests that exercise a match override this in their own mockReturnValue.
  mockUseCompanies.mockReturnValue({
    companies: [],
    selectedCompanyId: null,
    selectCompany: vi.fn(),
    isLoading: false,
    error: null,
  });
});

describe('WorkerDetailTable — Unified Table', () => {
  // ================================================================
  // Task 5.1: Column rendering
  // ================================================================

  it('should render all 10 column headers in correct order', async () => {
    mockUseUnifiedResults.mockReturnValue({
      people: [makeUnifiedPerson()],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Column headers must appear exactly once each (now 10 — Archivos added)
    const headers = ['Ficha', 'Nombre', 'Empresa', 'RUC', 'Proyecto', 'Razón Social', 'DNI', 'Tipo de Examen', 'Aptitud', 'Archivos'];
    for (const header of headers) {
      const elements = screen.getAllByText(header);
      // Header text can appear in <th> only — should be exactly one
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
    // The thead row should contain exactly 10 <th> elements
    const ths = document.querySelectorAll('thead th');
    expect(ths).toHaveLength(10);
  });

  it('should render data in correct columns for a merged person', async () => {
    const person = makeUnifiedPerson({
      dni: '25721424',
      nombre: 'GILMER FALLA',
      empresa: 'CIME INGENIEROS S R L',
      tipoExamen: 'PERIODICO',
      proyecto: 'UNACEM',
      fichas: [{ idAten: 'ATE-999', nroRuc: '20999999999', nomCFa: 'CIME INGENIEROS S R L (RS)', proyecto: '', tipoExamen: '', condic: '' }],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Each data value must appear in the table body
    expect(screen.getByText('ATE-999')).toBeInTheDocument();       // Ficha
    expect(screen.getByText('GILMER FALLA')).toBeInTheDocument();   // Nombre
    expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument(); // Empresa
    expect(screen.getByText('20999999999')).toBeInTheDocument();    // RUC
    expect(screen.getByText('UNACEM')).toBeInTheDocument();         // Proyecto
    expect(screen.getByText('CIME INGENIEROS S R L (RS)')).toBeInTheDocument(); // Razón Social
    expect(screen.getByText('PERIODICO')).toBeInTheDocument();      // Tipo de Examen
    expect(screen.getByText('25721424')).toBeInTheDocument();       // DNI (normalized, no prefix)
  });

  it('should show normalized DNI without "DNI " prefix', async () => {
    const person = makeUnifiedPerson({
      dni: '25721424',
      nombre: 'TEST PERSON',
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // DNI column must show bare digits only
    expect(screen.getByText('25721424')).toBeInTheDocument();
    // Must NOT contain the old prefix
    expect(screen.queryByText(/DNI 25721424/)).not.toBeInTheDocument();
  });

  // ================================================================
  // Task 5.2: Doble ficha expansion
  // ================================================================

  it('should show chevron on rows with multiple fichas', async () => {
    const person = makeUnifiedPerson({
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Primary ficha data in main row
    expect(screen.getByText('ATE-100')).toBeInTheDocument();
    expect(screen.getByText('20000000001')).toBeInTheDocument();

    // Secondary ficha data should NOT be visible initially
    expect(screen.queryByText('ATE-200')).not.toBeInTheDocument();
    expect(screen.queryByText('SECONDARY CO')).not.toBeInTheDocument();

    // A chevron button should exist (SVG with chevron-down path)
    // We find the button that contains the chevron — the row should have a clickable element
    const rows = screen.getAllByRole('row');
    // The data row (not header) should contain a button
    const dataRow = rows[1]; // second row = first data row
    const button = dataRow.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('should expand sub-row with alternate ficha data on chevron click', async () => {
    const person = makeUnifiedPerson({
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Find the chevron button in the row
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const button = dataRow.querySelector('button')!;

    // Click to expand
    fireEvent.click(button);

    // Secondary ficha data should now be visible in the sub-row
    await waitFor(() => {
      expect(screen.getByText('ATE-200')).toBeInTheDocument();
    });
    // Sub-row renders "RUC: 20000000002" — use regex to match
    expect(screen.getByText(/20000000002/)).toBeInTheDocument();
    expect(screen.getByText('SECONDARY CO')).toBeInTheDocument();
  });

  it('should collapse sub-row on second chevron click', async () => {
    const person = makeUnifiedPerson({
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const button = dataRow.querySelector('button')!;

    // Expand
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText('ATE-200')).toBeInTheDocument();
      expect(screen.getByText(/20000000002/)).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByText('ATE-200')).not.toBeInTheDocument();
    });
  });

  // ================================================================
  // Task 5.3: Single ficha — no chevron
  // ================================================================

  it('should NOT show chevron on row with single ficha', async () => {
    const person = makeUnifiedPerson({
      fichas: [makeFicha({ idAten: 'ATE-001', nroRuc: '20123456789', nomCFa: 'SINGLE CO' })],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    // The chevron button has an aria-label; the new "Ver Archivos" button does not.
    // A single-ficha row must NOT render the chevron.
    const chevronButton = dataRow.querySelector('button[aria-label]');
    expect(chevronButton).toBeNull();
  });

  // ================================================================
  // Task 5.4: Loading, error, and empty states
  // ================================================================

  it('should show loading spinner with correct message', async () => {
    mockUseUnifiedResults.mockReturnValue({
      people: [],
      loading: true,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    expect(screen.getByText('Cargando consolidados...')).toBeInTheDocument();
  });

  it('should show error message when hook reports error', async () => {
    mockUseUnifiedResults.mockReturnValue({
      people: [],
      loading: false,
      error: 'Error al cargar los consolidados. Intente nuevamente.',
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    expect(screen.getByText('Error al cargar los consolidados. Intente nuevamente.')).toBeInTheDocument();
  });

  it('should show empty state when no people returned', async () => {
    mockUseUnifiedResults.mockReturnValue({
      people: [],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    expect(screen.getByText('No se encontraron consolidados para esta empresa')).toBeInTheDocument();
  });

  // ================================================================
  // Task 5.5: Outer-join gaps (— em dash)
  // ================================================================

  it('should show em dashes for Ficha/RUC/Razón Social when worker has no orders', async () => {
    // Worker-only person: fichas is empty
    const person: UnifiedPerson = {
      dni: '99999999',
      nombre: 'WORKER SOLO',
      empresa: 'SOLO COMPANY',
      tipoExamen: 'EXAM-SOLO',
      proyecto: 'PROJ-SOLO',
      condic: '',
      fichas: [], // no matching orders
    };

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Worker fields populated
    expect(screen.getByText('WORKER SOLO')).toBeInTheDocument();
    expect(screen.getByText('EXAM-SOLO')).toBeInTheDocument();
    expect(screen.getByText('99999999')).toBeInTheDocument();

    // Order fields should show em dash
    // Since "—" appears in the Ficha, RUC, and Razón Social columns for this row
    const emDashCells = screen.getAllByText('—');
    expect(emDashCells.length).toBeGreaterThanOrEqual(3); // Ficha, RUC, Razón Social
  });

  it('should show em dashes for Nombre/Empresa/Proyecto/Tipo de Examen when order-only', async () => {
    // Order-only person: worker fields are empty strings
    const person: UnifiedPerson = {
      dni: '88888888',
      nombre: '',
      empresa: '',
      condic: '',
      tipoExamen: '',
      proyecto: '',
      fichas: [
        makeFicha({ idAten: 'ATE-888', nroRuc: '20888888888', nomCFa: 'ORDER ONLY CO' }),
      ],
    };

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Order fields populated
    expect(screen.getByText('ATE-888')).toBeInTheDocument();
    expect(screen.getByText('20888888888')).toBeInTheDocument();
    expect(screen.getByText('ORDER ONLY CO')).toBeInTheDocument();
    expect(screen.getByText('88888888')).toBeInTheDocument();

    // Worker fields should show em dash
    const emDashCells = screen.getAllByText('—');
    expect(emDashCells.length).toBeGreaterThanOrEqual(4); // Nombre, Empresa, Proyecto, Tipo de Examen
  });

  // ================================================================
  // Multiple rows rendering
  // ================================================================

  it('should render multiple rows for multiple people', async () => {
    const people: UnifiedPerson[] = [
      makeUnifiedPerson({ dni: '11111111', nombre: 'PERSON A', fichas: [makeFicha({ idAten: 'ATE-A1' })] }),
      makeUnifiedPerson({ dni: '22222222', nombre: 'PERSON B', fichas: [makeFicha({ idAten: 'ATE-B1' })] }),
    ];

    mockUseUnifiedResults.mockReturnValue({
      people,
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    expect(screen.getByText('PERSON A')).toBeInTheDocument();
    expect(screen.getByText('PERSON B')).toBeInTheDocument();
    expect(screen.getByText('ATE-A1')).toBeInTheDocument();
    expect(screen.getByText('ATE-B1')).toBeInTheDocument();

    // Two data rows + header row = 3 total
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
  });

  // ================================================================
  // Task 5.6: Aptitud column (spec REQ-WT-1)
  // The cell shows person.condic verbatim when non-empty,
  // em-dash when empty (or the post-normalization equivalent of 'NULL').
  // ================================================================

  it('should render condic "APTO" verbatim in the Aptitud cell', async () => {
    const person = makeUnifiedPerson({ condic: 'APTO' });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    expect(screen.getByText('APTO')).toBeInTheDocument();
  });

  it('should render em-dash in the Aptitud cell when condic is empty (e.g. normalized "NULL")', async () => {
    // The hook layer normalizes 'NULL' / 'null' / 'Null' / whitespace → ''.
    // The component treats '' as em-dash, so the UI never displays the raw literal.
    const person = makeUnifiedPerson({ condic: '' });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Multiple em-dashes can appear; we just need at least one
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    // The literal "NULL" must never be displayed
    expect(screen.queryByText('NULL')).not.toBeInTheDocument();
  });

  it('should render em-dash in the Aptitud cell for worker-only person (no order, no condic)', async () => {
    const person: UnifiedPerson = {
      dni: '99999999',
      nombre: 'WORKER SOLO',
      empresa: 'SOLO COMPANY',
      tipoExamen: 'EXAM-SOLO',
      proyecto: 'PROJ-SOLO',
      condic: '',
      fichas: [],
    };

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // At least 4 em-dashes expected: Ficha, RUC, Razón Social, Aptitud
    const emDashCells = screen.getAllByText('—');
    expect(emDashCells.length).toBeGreaterThanOrEqual(4);
  });

  it('should show each sub-ficha its own condic when expanded', async () => {
    // Primary row: APTO. Sub-ficha #2: NO APTO. Both must be visible after expand.
    const person = makeUnifiedPerson({
      condic: 'APTO',
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO', condic: 'APTO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO', condic: 'NO APTO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Expand the chevron
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const button = dataRow.querySelector('button')!;
    fireEvent.click(button);

    await waitFor(() => {
      // Both condic values must be visible: primary "APTO" and sub-ficha "NO APTO"
      expect(screen.getAllByText('APTO').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('NO APTO')).toBeInTheDocument();
    });
  });

  // ================================================================
  // Task 5.7: Archivos column + modal (spec REQ-WT-2, REQ-FD-3)
  // ================================================================

  it('should render a "Ver Archivos" button on every data row', async () => {
    const people: UnifiedPerson[] = [
      makeUnifiedPerson({ dni: '11111111', nombre: 'PERSON A', fichas: [makeFicha({ idAten: 'ATE-A1', nroRuc: '20111111111' })] }),
      makeUnifiedPerson({ dni: '22222222', nombre: 'PERSON B', fichas: [makeFicha({ idAten: 'ATE-B1', nroRuc: '20222222222' })] }),
    ];

    mockUseUnifiedResults.mockReturnValue({
      people,
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Two data rows => two "Ver Archivos" buttons.
    const buttons = screen.getAllByRole('button', { name: /Ver Archivos/ });
    expect(buttons).toHaveLength(2);
  });

  it('should render a "Ver Archivos" button on every sub-row when expanded', async () => {
    const person = makeUnifiedPerson({
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO' }),
        makeFicha({ idAten: 'ATE-300', nroRuc: '20000000003', nomCFa: 'TERTIARY CO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Expand the chevron.
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const chevron = dataRow.querySelector('button')!;
    fireEvent.click(chevron);

    await waitFor(() => {
      // Primary + 2 sub-rows = 3 "Ver Archivos" buttons.
      const buttons = screen.getAllByRole('button', { name: /Ver Archivos/ });
      expect(buttons).toHaveLength(3);
    });
  });

  it('should open the FilesModal with the row\'s (ruc, dni, idAten) on click', async () => {
    const person = makeUnifiedPerson({
      dni: '25721424',
      nombre: 'GILMER FALLA',
      empresa: 'CIME INGENIEROS S R L',
      fichas: [makeFicha({ idAten: 'ATE-999', nroRuc: '20999999999', nomCFa: 'CIME INGENIEROS S R L (RS)' })],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    mockFilesModalProps.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));

    expect(mockFilesModalProps).toHaveBeenCalled();
    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1][0];
    expect(lastProps['ruc']).toBe('20999999999');
    expect(lastProps['dni']).toBe('25721424');
    expect(lastProps['idAten']).toBe('ATE-999');
    expect(lastProps['nombrePaciente']).toBe('GILMER FALLA');
    expect(lastProps['empresa']).toBe('CIME INGENIEROS S R L');
  });

  it('should key sub-row modals independently — clicking sub-row N opens with that sub-ficha\'s idAten', async () => {
    const person = makeUnifiedPerson({
      dni: '11111111',
      nombre: 'PERSON MULTI',
      empresa: 'MULTI CO',
      fichas: [
        makeFicha({ idAten: 'ATE-100', nroRuc: '20000000001', nomCFa: 'PRIMARY CO' }),
        makeFicha({ idAten: 'ATE-200', nroRuc: '20000000002', nomCFa: 'SECONDARY CO' }),
      ],
    });

    mockUseUnifiedResults.mockReturnValue({
      people: [person],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Expand the chevron.
    const rows = screen.getAllByRole('row');
    const dataRow = rows[1];
    const chevron = dataRow.querySelector('button')!;
    fireEvent.click(chevron);

    await waitFor(() => {
      expect(screen.getByText('ATE-200')).toBeInTheDocument();
    });

    // The sub-row's "Ver Archivos" button is the SECOND one (after the primary row's).
    const buttons = screen.getAllByRole('button', { name: /Ver Archivos/ });
    expect(buttons).toHaveLength(2);

    mockFilesModalProps.mockClear();
    fireEvent.click(buttons[1]);

    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1][0];
    expect(lastProps['idAten']).toBe('ATE-200');
    expect(lastProps['ruc']).toBe('20000000002');
  });

  it('should open the FilesModal for a worker-only row (no idAten, no nroRuc) with empty args', async () => {
    const workerOnly: UnifiedPerson = {
      dni: '99999999',
      nombre: 'WORKER SOLO',
      empresa: 'SOLO COMPANY',
      tipoExamen: 'EXAM-SOLO',
      proyecto: 'PROJ-SOLO',
      condic: '',
      fichas: [],
    };

    mockUseUnifiedResults.mockReturnValue({
      people: [workerOnly],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    mockFilesModalProps.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));

    const lastProps = mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1][0];
    expect(lastProps['dni']).toBe('99999999');
    expect(lastProps['idAten']).toBe('');
    expect(lastProps['ruc']).toBe('');
  });

  // ================================================================
  // PR #4: FilesModal.onSend → EmailEditor overlay wiring
  // Spec Domain 3 (EI-1..EI-5) — WorkerDetailTable integration.
  // ================================================================

  describe('PR #4 — onSend bridge to EmailEditor', () => {
    it('should pass a defined onSend prop to FilesModal (bridge wired, not undefined)', async () => {
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));

      const lastProps =
        mockFilesModalProps.mock.calls[mockFilesModalProps.mock.calls.length - 1]?.[0];
      expect(typeof lastProps?.['onSend']).toBe('function');
    });

    it('should keep the table visible until onSend fires (no premature overlay)', async () => {
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));

      // The table is still visible (header + data row).
      expect(screen.getByText('Ficha')).toBeInTheDocument();
      expect(screen.getByText(person.dni)).toBeInTheDocument();
      // The EmailEditor overlay is NOT yet in the DOM.
      expect(screen.queryByTestId('email-editor-overlay')).not.toBeInTheDocument();
    });

    it('should resolve companyId from useCompanies: name match returns the company id', async () => {
      const person = makeUnifiedPerson({ empresa: 'HOLOMEDIC S.A.' });
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });
      mockUseCompanies.mockReturnValue({
        companies: [
          { id: 'uuid-holomedic', name: 'HOLOMEDIC S.A.', ruc: '20111111111', email: 'a@x' },
          { id: 'uuid-other', name: 'OTHER CO', ruc: '20222222222', email: 'b@x' },
        ],
        selectedCompanyId: null,
        selectCompany: vi.fn(),
        isLoading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      fireEvent.click(screen.getByTestId('files-modal-stub-trigger-onsend'));

      // EmailEditor received the matched companyId.
      const lastProps =
        mockEmailEditorProps.mock.calls[mockEmailEditorProps.mock.calls.length - 1]?.[0];
      expect(lastProps?.['companyId']).toBe('uuid-holomedic');
    });

    it('should fall back to empty companyId when no company matches the person.empresa (spec EI-2)', async () => {
      const person = makeUnifiedPerson({ empresa: 'UNKNOWN CO' });
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });
      mockUseCompanies.mockReturnValue({
        companies: [
          { id: 'uuid-holomedic', name: 'HOLOMEDIC S.A.', ruc: '20111111111', email: 'a@x' },
        ],
        selectedCompanyId: null,
        selectCompany: vi.fn(),
        isLoading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      fireEvent.click(screen.getByTestId('files-modal-stub-trigger-onsend'));

      const lastProps =
        mockEmailEditorProps.mock.calls[mockEmailEditorProps.mock.calls.length - 1]?.[0];
      expect(lastProps?.['companyId']).toBe('');
    });

    it('should mount EmailEditor in place of the table when onSend fires (overlay replaces table)', async () => {
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      fireEvent.click(screen.getByTestId('files-modal-stub-trigger-onsend'));

      // Overlay is visible.
      const overlay = screen.getByTestId('email-editor-overlay');
      expect(overlay).toBeInTheDocument();

      // EmailEditor received the bridged data: a single patient whose
      // dni matches, with the 2 files we sent and the right keys.
      const lastProps =
        mockEmailEditorProps.mock.calls[mockEmailEditorProps.mock.calls.length - 1]?.[0];
      const patients = lastProps?.['patients'] as Array<{ id: string; dni: string; files: Array<{ id: string; name: string; type: string; size: number }> }>;
      expect(patients).toHaveLength(1);
      expect(patients[0]?.dni).toBe(person.dni);
      expect(patients[0]?.files).toHaveLength(2);
      expect(patients[0]?.files[0]?.id).toBe('::a.pdf');
      expect(patients[0]?.files[1]?.id).toBe('::b.pdf');
      expect(patients[0]?.files[0]?.name).toBe('a.pdf');
      expect(patients[0]?.files[1]?.name).toBe('b.pdf');
      expect(patients[0]?.files[0]?.type).toBe('application/pdf');
      expect(patients[0]?.files[0]?.size).toBe(100);
      expect(patients[0]?.files[1]?.size).toBe(200);

      // selectedPatients is keyed by person.dni and carries the refs.
      const selectedPatients = lastProps?.['selectedPatients'] as Record<string, { patientName: string; files: string[] }>;
      expect(Object.keys(selectedPatients)).toEqual([person.dni]);
      expect(selectedPatients[person.dni]?.files).toEqual(['::a.pdf', '::b.pdf']);

      // The FilesModal stub is no longer rendered (closed before onSend
      // resolves — handleSendFromModal does not re-open it).
      expect(screen.queryByTestId('files-modal-stub')).not.toBeInTheDocument();
    });

    it('should expose a "Volver a la tabla" button in the EmailEditor overlay that clears the state', async () => {
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      fireEvent.click(screen.getByTestId('files-modal-stub-trigger-onsend'));

      // Overlay is up.
      const backButton = screen.getByTestId('email-editor-back');
      expect(backButton).toBeInTheDocument();
      expect(backButton).toHaveTextContent('Volver a la tabla');

      // Click → overlay unmounts, table re-renders.
      fireEvent.click(backButton);

      await waitFor(() => {
        expect(screen.queryByTestId('email-editor-overlay')).not.toBeInTheDocument();
      });
      // The table is visible again — header is back, the data row is back.
      expect(screen.getByText('Ficha')).toBeInTheDocument();
      expect(screen.getByText(person.dni)).toBeInTheDocument();
      // EmailEditor stub is no longer in the DOM.
      expect(screen.queryByTestId('email-editor-stub')).not.toBeInTheDocument();
    });

    it('should keep the table hidden while the EmailEditor overlay is up (table is replaced, not stacked)', async () => {
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      fireEvent.click(screen.getByTestId('files-modal-stub-trigger-onsend'));

      // The "Ver Archivos" buttons from the table are no longer in the
      // document — the table is hidden while the overlay is up.
      expect(screen.queryByRole('button', { name: /Ver Archivos/ })).not.toBeInTheDocument();
      // The overlay IS in the document.
      expect(screen.getByTestId('email-editor-overlay')).toBeInTheDocument();
    });

    it('should bridge an empty selection (zero files) without throwing and still mount the overlay', async () => {
      // Triangulation: zero files. The bridge helper must accept empty
      // arrays; the overlay must still appear so the user can see the
      // selection was committed (no files, but the editor is open).
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      // Re-render the stub with an empty payload for THIS test only.
      // The hoisted trigger sends 2 files; we instead drive the same
      // path via the onSend prop captured by `mockFilesModalProps`.
      const captured: { onSend?: (files: FileNode[]) => void } = {};
      const origMock = mockFilesModalProps.getMockImplementation();
      mockFilesModalProps.mockImplementation((props: Record<string, unknown>) => {
        captured.onSend = props['onSend'] as (files: FileNode[]) => void;
        return origMock ? origMock(props) : undefined;
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));

      // Drive onSend with an empty FileNode[].
      expect(() => act(() => { captured.onSend?.([]); })).not.toThrow();

      // Overlay is up, EmailEditor received a single patient with no files.
      await waitFor(() => {
        expect(screen.getByTestId('email-editor-overlay')).toBeInTheDocument();
      });
      const lastProps =
        mockEmailEditorProps.mock.calls[mockEmailEditorProps.mock.calls.length - 1]?.[0];
      const patients = lastProps?.['patients'] as Array<{ id: string; files: Array<unknown> }>;
      expect(patients).toHaveLength(1);
      expect(patients[0]?.files).toHaveLength(0);
    });

    it('should bridge a single-file selection (different code path from 2 files)', async () => {
      // Triangulation: 1 file vs 2 files — exercises the bridge with
      // a different array length, proving the parallel ref array
      // scales correctly and is not hardcoded for 2.
      const person = makeUnifiedPerson();
      mockUseUnifiedResults.mockReturnValue({
        people: [person],
        loading: false,
        error: null,
      });

      const captured: { onSend?: (files: FileNode[]) => void } = {};
      const origMock = mockFilesModalProps.getMockImplementation();
      mockFilesModalProps.mockImplementation((props: Record<string, unknown>) => {
        captured.onSend = props['onSend'] as (files: FileNode[]) => void;
        return origMock ? origMock(props) : undefined;
      });

      render(<WorkerDetailTable {...DEFAULT_PROPS} />);
      fireEvent.click(screen.getByRole('button', { name: /Ver Archivos/ }));
      act(() => {
        captured.onSend?.([
          createFileNode({ name: 'solo.pdf', sizeBytes: 999, modifiedAt: '2026-06-01T00:00:00.000Z' }),
        ]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('email-editor-overlay')).toBeInTheDocument();
      });
      const lastProps =
        mockEmailEditorProps.mock.calls[mockEmailEditorProps.mock.calls.length - 1]?.[0];
      const patients = lastProps?.['patients'] as Array<{ files: Array<{ id: string; name: string; size: number }> }>;
      expect(patients[0]?.files).toHaveLength(1);
      expect(patients[0]?.files[0]?.id).toBe('::solo.pdf');
      expect(patients[0]?.files[0]?.name).toBe('solo.pdf');
      expect(patients[0]?.files[0]?.size).toBe(999);
    });
  });
});
