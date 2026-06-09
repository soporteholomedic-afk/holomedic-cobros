import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorkerDetailTable } from '../WorkerDetailTable';
import type { CompanyGroup } from '@/types/sp-result';

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

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

describe('WorkerDetailTable', () => {
  it('should show loading indicator initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." />);

    expect(screen.getByText('Cargando trabajadores...')).toBeInTheDocument();
  });

  it('should display worker rows with nombre, tipoExamen, and proyecto columns', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." />);

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

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." />);

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

    render(<WorkerDetailTable companyName="NONEXISTENT CO" />);

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

    render(<WorkerDetailTable companyName="EMPTY CO" />);

    await waitFor(() => {
      expect(screen.getByText(/No se encontraron trabajadores/i)).toBeInTheDocument();
    });
  });

  it('should show error state when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<WorkerDetailTable companyName="TEST CO" />);

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar los trabajadores/i)).toBeInTheDocument();
    });
  });

  it('should display correct company heading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    render(<WorkerDetailTable companyName="CHOICE SERVICE S.A.C." />);

    await waitFor(() => {
      const nameCells = screen.getAllByText('ASTORGA FLORES MARTIN ADRIAN');
      expect(nameCells).toHaveLength(2);
    });

    // Company name should be displayed as a heading
    expect(screen.getByText('CHOICE SERVICE S.A.C.')).toBeInTheDocument();
  });
});
