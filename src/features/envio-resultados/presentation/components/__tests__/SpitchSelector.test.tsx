import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the use case ----
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../application/getSptiches', () => ({
  GetSptichesUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

vi.mock('../../../infrastructure/mock/spitchRepo', () => ({
  MockSpitchRepo: vi.fn(),
}));

// ---- Import under test ----
import { SpitchSelector } from '../SpitchSelector';
import type { Spitch } from '../../../domain/entities';

const mockCompanySpitches: Spitch[] = [
  {
    id: 'spitch-001',
    type: 'company',
    name: 'Resumen general de resultados',
    subject: 'Informe consolidado — test',
    bodyHtml: '<p>Test company body</p>',
  },
  {
    id: 'spitch-002',
    type: 'company',
    name: 'Resultados por paciente — detallado',
    subject: 'Resultados detallados — test',
    bodyHtml: '<p>Test detailed body</p>',
  },
];

const mockPatientSpitches: Spitch[] = [
  {
    id: 'spitch-003',
    type: 'patient',
    name: 'Notificación personal de resultados',
    subject: 'Resultados de sus exámenes — test',
    bodyHtml: '<p>Test patient body</p>',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockReset();
});

describe('SpitchSelector', () => {
  it('should show loading state while fetching spitches', () => {
    mockExecute.mockReturnValue(new Promise<Spitch[]>(() => {}));

    render(<SpitchSelector target="company" onSelect={() => {}} />);

    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('should render company spitches in the dropdown', async () => {
    mockExecute.mockResolvedValue(mockCompanySpitches);

    const onSelect = vi.fn();
    render(<SpitchSelector target="company" onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Resumen general de resultados')).toBeInTheDocument();
    });

    expect(screen.getByText('Resultados por paciente — detallado')).toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });

  it('should render patient spitches when target is patient', async () => {
    mockExecute.mockResolvedValue(mockPatientSpitches);

    const onSelect = vi.fn();
    render(<SpitchSelector target="patient" onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Notificación personal de resultados')).toBeInTheDocument();
    });
  });

  it('should call onSelect when a spitch is selected', async () => {
    mockExecute.mockResolvedValue(mockCompanySpitches);

    const onSelect = vi.fn();
    render(<SpitchSelector target="company" onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Resumen general de resultados')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'spitch-001' } });

    expect(onSelect).toHaveBeenCalledWith(mockCompanySpitches[0]);
  });

  it('should pre-select the option matching selectedId', async () => {
    mockExecute.mockResolvedValue(mockCompanySpitches);

    render(
      <SpitchSelector target="company" onSelect={() => {}} selectedId="spitch-002" />,
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('spitch-002');
    });
  });

  it('should call GetSptichesUseCase with correct type', async () => {
    mockExecute.mockResolvedValue(mockPatientSpitches);

    render(<SpitchSelector target="patient" onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    });

    // The use case should have been called with 'patient'
    expect(mockExecute).toHaveBeenCalledWith('patient');
  });
});
