import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock the GetPatientsByCompanyUseCase ----

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../application/getPatientsByCompany', () => ({
  GetPatientsByCompanyUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

// ---- Import the component being tested ----

import { PatientTable } from '../PatientTable';
import type { Patient } from '../../../domain/entities';

const mockPatients: Patient[] = [
  {
    id: 'pat-001',
    companyId: 'comp-001',
    name: 'María Elena García López',
    dni: '12345678',
    files: [
      { id: 'file-001', patientId: 'pat-001', name: 'CAMO.pdf', type: 'application/pdf', size: 245760 },
      { id: 'file-002', patientId: 'pat-001', name: 'EMO.pdf', type: 'application/pdf', size: 184320 },
    ],
  },
  {
    id: 'pat-002',
    companyId: 'comp-001',
    name: 'Carlos Alberto Mendoza Rivas',
    dni: '23456789',
    files: [
      { id: 'file-003', patientId: 'pat-002', name: 'Legajo.pdf', type: 'application/pdf', size: 512000 },
      { id: 'file-004', patientId: 'pat-002', name: 'CAMO.pdf', type: 'application/pdf', size: 198656 },
      { id: 'file-005', patientId: 'pat-002', name: 'EMO.pdf', type: 'application/pdf', size: 172032 },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockReset();
});

describe('PatientTable', () => {
  it('should show loading indicator while fetching patients', () => {
    mockExecute.mockReturnValue(new Promise<Patient[]>(() => {}));

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    expect(screen.getByText('Cargando pacientes...')).toBeInTheDocument();
  });

  it('should display patients with name and DNI after loading', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    expect(screen.getByText('Carlos Alberto Mendoza Rivas')).toBeInTheDocument();
    expect(screen.getByText('DNI: 12345678')).toBeInTheDocument();
    expect(screen.getByText('DNI: 23456789')).toBeInTheDocument();
  });

  it('should show file checkboxes for each patient when expanded', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    // Click to expand first patient
    fireEvent.click(screen.getByText('María Elena García López'));

    // Should show the file checkboxes
    expect(screen.getByLabelText('CAMO.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('EMO.pdf')).toBeInTheDocument();
  });

  it('should toggle file checkbox selection when clicked', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    // Expand first patient
    fireEvent.click(screen.getByText('María Elena García López'));

    const camoCheckbox = screen.getByLabelText('CAMO.pdf') as HTMLInputElement;
    const emoCheckbox = screen.getByLabelText('EMO.pdf') as HTMLInputElement;

    // Both should be checked by default
    expect(camoCheckbox.checked).toBe(true);
    expect(emoCheckbox.checked).toBe(true);

    // Uncheck CAMO
    fireEvent.click(camoCheckbox);
    expect(camoCheckbox.checked).toBe(false);
    expect(emoCheckbox.checked).toBe(true);
  });

  it('should call onSelectionChange with selected patients and their files', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const handleSelectionChange = vi.fn();
    render(<PatientTable companyId="comp-001" onSelectionChange={handleSelectionChange} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    // Expand first patient
    fireEvent.click(screen.getByText('María Elena García López'));

    // The selection change should be called with all patients and their files initially
    // Since all patients have all files checked by default
    expect(handleSelectionChange).toHaveBeenCalled();

    const lastCall = handleSelectionChange.mock.calls[handleSelectionChange.mock.calls.length - 1][0];
    expect(lastCall['pat-001']).toBeDefined();
    expect(lastCall['pat-001'].patientName).toBe('María Elena García López');
    expect(lastCall['pat-001'].files).toContain('file-001');
    expect(lastCall['pat-001'].files).toContain('file-002');
    expect(lastCall['pat-002']).toBeDefined();
    expect(lastCall['pat-002'].patientName).toBe('Carlos Alberto Mendoza Rivas');
  });

  it('should update selection when a file checkbox is toggled', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const handleSelectionChange = vi.fn();
    render(<PatientTable companyId="comp-001" onSelectionChange={handleSelectionChange} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    // Expand first patient
    fireEvent.click(screen.getByText('María Elena García López'));

    // Clear the call history from initial render
    handleSelectionChange.mockClear();

    // Uncheck CAMO.pdf
    fireEvent.click(screen.getByLabelText('CAMO.pdf'));

    expect(handleSelectionChange).toHaveBeenCalled();
    const lastCall = handleSelectionChange.mock.calls[handleSelectionChange.mock.calls.length - 1][0];
    expect(lastCall['pat-001'].files).not.toContain('file-001');
    expect(lastCall['pat-001'].files).toContain('file-002');
  });

  it('should show empty message when no patients are returned', async () => {
    mockExecute.mockResolvedValue([]);

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('No hay pacientes para esta empresa')).toBeInTheDocument();
    });
  });

  it('should not display loading after patients have loaded', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    render(<PatientTable companyId="comp-001" onSelectionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cargando pacientes...')).not.toBeInTheDocument();
  });
});
