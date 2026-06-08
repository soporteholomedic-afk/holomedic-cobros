import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the GetCompaniesUseCase ----

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../application/getCompanies', () => ({
  GetCompaniesUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

// ---- Import the component being tested ----

import { CompanySelector } from '../CompanySelector';
import type { Company } from '../../../domain/entities';

const mockCompanies: Company[] = [
  {
    id: 'comp-001',
    name: 'Clínica San Pablo',
    ruc: '20123456789',
    email: 'resultados@clinicasanpablo.pe',
  },
  {
    id: 'comp-002',
    name: 'Laboratorio Médico',
    ruc: '20234567890',
    email: 'lab@labmedico.pe',
  },
  {
    id: 'comp-003',
    name: 'Centro de Diagnóstico',
    ruc: '20345678901',
    email: 'resultados@centrodiagnostico.pe',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockReset();
});

describe('CompanySelector', () => {
  it('should show loading indicator while fetching companies', () => {
    // Keep the promise pending so loading persists
    mockExecute.mockReturnValue(new Promise<Company[]>(() => {}));

    render(<CompanySelector onSelect={() => {}} />);

    expect(screen.getByText('Cargando empresas...')).toBeInTheDocument();
  });

  it('should display company cards with name, RUC, and email after loading', async () => {
    mockExecute.mockResolvedValue(mockCompanies);

    render(<CompanySelector onSelect={() => {}} />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByText('Clínica San Pablo')).toBeInTheDocument();
    });

    expect(screen.getByText('Clínica San Pablo')).toBeInTheDocument();
    expect(screen.getByText('Laboratorio Médico')).toBeInTheDocument();
    expect(screen.getByText('Centro de Diagnóstico')).toBeInTheDocument();

    // Check RUC is displayed
    expect(screen.getByText('20123456789')).toBeInTheDocument();
    expect(screen.getByText('20234567890')).toBeInTheDocument();
    expect(screen.getByText('20345678901')).toBeInTheDocument();

    // Check email is displayed
    expect(screen.getByText('resultados@clinicasanpablo.pe')).toBeInTheDocument();
    expect(screen.getByText('lab@labmedico.pe')).toBeInTheDocument();
    expect(screen.getByText('resultados@centrodiagnostico.pe')).toBeInTheDocument();
  });

  it('should call onSelect with company ID when a company card is clicked', async () => {
    mockExecute.mockResolvedValue(mockCompanies);

    const handleSelect = vi.fn();
    render(<CompanySelector onSelect={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Clínica San Pablo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Clínica San Pablo'));
    expect(handleSelect).toHaveBeenCalledWith('comp-001');

    fireEvent.click(screen.getByText('Laboratorio Médico'));
    expect(handleSelect).toHaveBeenCalledWith('comp-002');
  });

  it('should show empty message when no companies are returned', async () => {
    mockExecute.mockResolvedValue([]);

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('No hay empresas disponibles')).toBeInTheDocument();
    });
  });

  it('should not display loading after companies have loaded', async () => {
    mockExecute.mockResolvedValue(mockCompanies);

    render(<CompanySelector onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Clínica San Pablo')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cargando empresas...')).not.toBeInTheDocument();
  });
});
