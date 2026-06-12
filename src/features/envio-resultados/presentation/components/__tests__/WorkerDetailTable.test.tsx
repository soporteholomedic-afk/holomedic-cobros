import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';

// ---- Hoisted mock for useUnifiedResults ----

const mockUseUnifiedResults = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useUnifiedResults', () => ({
  useUnifiedResults: mockUseUnifiedResults,
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
});

describe('WorkerDetailTable — Unified Table', () => {
  // ================================================================
  // Task 5.1: Column rendering
  // ================================================================

  it('should render all 9 column headers in correct order', async () => {
    mockUseUnifiedResults.mockReturnValue({
      people: [makeUnifiedPerson()],
      loading: false,
      error: null,
    });

    render(<WorkerDetailTable {...DEFAULT_PROPS} />);

    // Column headers must appear exactly once each (now 9 — Aptitud added)
    const headers = ['Ficha', 'Nombre', 'Empresa', 'RUC', 'Proyecto', 'Razón Social', 'DNI', 'Tipo de Examen', 'Aptitud'];
    for (const header of headers) {
      const elements = screen.getAllByText(header);
      // Header text can appear in <th> only — should be exactly one
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
    // The thead row should contain exactly 9 <th> elements
    const ths = document.querySelectorAll('thead th');
    expect(ths).toHaveLength(9);
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
    const button = dataRow.querySelector('button');
    // Must NOT have a chevron button
    expect(button).toBeNull();
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
});
