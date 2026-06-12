import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorkerDetailTable } from '../WorkerDetailTable';
import type { CompanyGroup, OrderRow } from '@/types/sp-result';

// ---- Fixture data matching SP result structure from SQLSERVER/ejemplo_resultados.txt ----

const mockApiResponse = {
  companies: [
    {
      companyName: 'CHOICE SERVICE S.A.C.',
      workers: [
        { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'PREOCUPACIONAL', proyecto: 'NEXA CAJAMARQUILLA' },
        { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'ADICIONALES', proyecto: 'ADICIONALES' },
      ],
      workerCount: 2,
    },
    {
      companyName: 'CIME INGENIEROS S R L',
      workers: [
        { nombre: 'FALLA PEÑA GILMER DUBERLY', tipoExamen: 'PERIODICO', proyecto: 'UNACEM' },
      ],
      workerCount: 1,
    },
  ] as CompanyGroup[],
};

// ---- Patient fixture data (SP_SEL_ORDEN output shape) ----

const mockPatientRows: OrderRow[] = [
  { IdAten: 'ATE-001', NroRuc: '20123456789', NomCFa: 'CHOICE SERVICE S.A.C.', NroDId: '12345678' },
  { IdAten: 'ATE-002', NroRuc: '20123456789', NomCFa: 'CHOICE SERVICE S.A.C.', NroDId: '87654321' },
  { IdAten: 'ATE-003', NroRuc: '20987654321', NomCFa: 'CHOICE SERVICE S.A.C.', NroDId: '11223344' },
];

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

const DEFAULT_PROPS = {
  fechaInicio: '2026-01-01',
  fechaFin: '2026-06-30',
} as const;

describe('WorkerDetailTable', () => {
  it('should show loading indicator initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    expect(screen.getByText('Cargando trabajadores...')).toBeInTheDocument();
  });

  it('should display worker rows with nombre, tipoExamen, and proyecto columns', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Column headers
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Tipo de Examen')).toBeInTheDocument();
    expect(screen.getByText('Proyecto')).toBeInTheDocument();

    // First row data
    expect(screen.getByText('PREOCUPACIONAL')).toBeInTheDocument();
    expect(screen.getByText('NEXA CAJAMARQUILLA')).toBeInTheDocument();

    // Second row data (same worker, different exam)
    // ADICIONALES appears in both TipoExamen and Proyecto columns
    const adicionalesCells = screen.getAllByText('ADICIONALES');
    expect(adicionalesCells).toHaveLength(2);
  });

  it('should display multiple rows for a worker with multiple exams', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    await waitFor(() => {
      const rows = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(rows).toHaveLength(2);
    });
  });

  it('should show empty state when company is not found in API response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<WorkerDetailTable companyName="NONEXISTENT CO" {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/No se encontraron trabajadores/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when company has no workers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        companies: [{ companyName: 'EMPTY CO', workers: [], workerCount: 0 }],
      }),
    });

    render(<WorkerDetailTable companyName="EMPTY CO" {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/No se encontraron trabajadores/i)).toBeInTheDocument();
    });
  });

  it('should show error state when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<WorkerDetailTable companyName="TEST CO" {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar los trabajadores/i)).toBeInTheDocument();
    });
  });

  it('should display correct company heading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Company name should be displayed as a heading
    expect(screen.getByText('CHOICE SERVICE S.A.C.')).toBeInTheDocument();
  });

  // ---- Patient data tests (PR 2) ----

  it('should render patient table with IdAten, NroRuc, NomCFa, and NroDId columns', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPatientRows),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    // Wait for both fetches to resolve (worker data renders)
    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Patient table heading
    expect(screen.getByText('Datos de Pacientes')).toBeInTheDocument();

    // Patient column headers
    expect(screen.getByText('Ficha')).toBeInTheDocument();
    expect(screen.getByText('RUT Empresa')).toBeInTheDocument();
    expect(screen.getByText('Razón Social')).toBeInTheDocument();
    expect(screen.getByText('DNI')).toBeInTheDocument();

    // Patient row data
    expect(screen.getByText('ATE-001')).toBeInTheDocument();
    expect(screen.getByText('ATE-002')).toBeInTheDocument();
    expect(screen.getByText('ATE-003')).toBeInTheDocument();
    const rutCells = screen.getAllByText('20123456789');
    expect(rutCells).toHaveLength(2); // appears in two patient rows
    expect(screen.getByText('12345678')).toBeInTheDocument();
  });

  it('should show loading state for patient section while patient data loads', async () => {
    // Worker resolves immediately, patient stays pending
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/consolidados/results_by_companies')) {
        return new Promise(() => {}); // never resolves
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    // Worker data renders
    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Patient loading spinner and message visible
    expect(screen.getByText('Cargando pacientes...')).toBeInTheDocument();
  });

  it('should show empty state when no patient data returned', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    // Worker data renders
    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Patient empty state message
    expect(screen.getByText(/No se encontraron pacientes/i)).toBeInTheDocument();
  });

  it('should show patient error state while worker table renders normally', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.reject(new Error('Patient fetch failed'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    // Worker data renders normally
    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Worker table heading still visible
    expect(screen.getByText('CHOICE SERVICE S.A.C.')).toBeInTheDocument();

    // Patient error message visible
    expect(screen.getByText(/Error al cargar los pacientes/i)).toBeInTheDocument();

    // Worker error message should NOT be present
    expect(screen.queryByText(/Error al cargar los trabajadores/i)).not.toBeInTheDocument();
  });

  it('should fire both fetches with correct query parameters', async () => {
    const fetchCalls: string[] = [];
    mockFetch.mockImplementation((url: string) => {
      fetchCalls.push(url);
      if (url.includes('/api/consolidados/results_by_companies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockPatientRows),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." {...DEFAULT_PROPS} />);

    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    const workerUrl = fetchCalls.find((c) => c.includes('/api/consolidados/results') && !c.includes('by_companies'));
    const patientUrl = fetchCalls.find((c) => c.includes('/api/consolidados/results_by_companies'));

    expect(workerUrl).toBeDefined();
    expect(patientUrl).toBeDefined();
    expect(workerUrl).toContain('fechaInicio=2026-01-01');
    expect(workerUrl).toContain('fechaFin=2026-06-30');
    expect(patientUrl).toContain('companyName=CHOICE+SERVICE+S.A.C.');
  });
});
