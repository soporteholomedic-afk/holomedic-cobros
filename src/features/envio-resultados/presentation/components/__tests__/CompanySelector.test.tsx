import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CompanySelector } from '../CompanySelector';
import type { CompanyGroup } from '@/types/sp-result';

// ---- Fixture data matching SP result structure from SQLSERVER/ejemplo_resultados.txt ----

const mockCompanies: CompanyGroup[] = [
  {
    companyName: 'CIME INGENIEROS S R L',
    workers: [
      { nombre: 'FALLA PEÑA GILMER DUBERLY', tipoExamen: 'PERIODICO', proyecto: 'UNACEM' },
    ],
    workerCount: 1,
  },
  {
    companyName: 'CHOICE SERVICE S.A.C.',
    workers: [
      { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'PREOCUPACIONAL', proyecto: 'NEXA CAJAMARQUILLA' },
      { nombre: 'ASTORGA FLORES MARTIN ADRIAN', tipoExamen: 'ADICIONALES', proyecto: 'ADICIONALES' },
    ],
    workerCount: 2,
  },
  {
    companyName: 'INTELLISOFT S.A.',
    workers: [
      { nombre: 'RODRIGUEZ MEDINA JHORDAN JOSE', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
      { nombre: 'CENTURION DIAZ NILDER ROMER', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
      { nombre: 'RAMOS FLORES LUIS MARTIN JUNIOR', tipoExamen: 'PREOCUPACIONAL', proyecto: 'DISEÑO Y ADECUACIÓN DE OF PARA NVO EDIFICIO DEL CONGRESO DE LA REPÚBLICA' },
    ],
    workerCount: 3,
  },
];

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

describe('CompanySelector', () => {
  it('should show loading indicator while fetching companies', () => {
    // Keep the promise pending so loading persists
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<CompanySelector onSelect={() => {}} />);

    expect(screen.getByText('Cargando empresas...')).toBeInTheDocument();
  });

  it('should display company cards with name and worker count after loading', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    // All three company names should be visible
    expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    expect(screen.getByText('CHOICE SERVICE S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('INTELLISOFT S.A.')).toBeInTheDocument();

    // Worker counts should be displayed (singular/plural)
    expect(screen.getByText('1 trabajador')).toBeInTheDocument();
    expect(screen.getByText('2 trabajadores')).toBeInTheDocument();
    expect(screen.getByText('3 trabajadores')).toBeInTheDocument();
  });

  it('should call onSelect with companyName when a company card is clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    const handleSelect = vi.fn();
    render(<CompanySelector onSelect={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CIME INGENIEROS S R L'));
    expect(handleSelect).toHaveBeenCalledWith('CIME INGENIEROS S R L', expect.any(String), expect.any(String));

    fireEvent.click(screen.getByText('CHOICE SERVICE S.A.C.'));
    expect(handleSelect).toHaveBeenCalledWith('CHOICE SERVICE S.A.C.', expect.any(String), expect.any(String));
  });

  it('should show empty message when API returns no companies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/No hay empresas disponibles/i)).toBeInTheDocument();
    });
  });

  it('should show error state with retry button when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Error al cargar las empresas/i)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: /reintentar/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('should retry fetch when retry button is clicked after error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ companies: mockCompanies }),
      });

    render(<CompanySelector onSelect={() => {}} />);

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText(/Error al cargar las empresas/i)).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    // Should now show company cards (re-fetched successfully)
    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not display loading indicator after companies have loaded', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
  });

  it('should call the API endpoint /api/consolidados/results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: mockCompanies }),
    });

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('CIME INGENIEROS S R L')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/consolidados/results'),
      expect.any(Object)
    );
  });
});
