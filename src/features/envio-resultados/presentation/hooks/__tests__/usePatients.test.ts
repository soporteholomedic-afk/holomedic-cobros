import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- Mock the use case ----
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../application/getPatientsByCompany', () => ({
  GetPatientsByCompanyUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

vi.mock('../../../infrastructure/mock/patientRepo', () => ({
  MockPatientRepo: vi.fn(),
}));

// ---- Import under test ----
import { usePatients } from '../usePatients';
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
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockReset();
});

describe('usePatients', () => {
  it('should load patients on mount with companyId', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const { result } = renderHook(() => usePatients('comp-001'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.patients).toEqual(mockPatients);
    expect(result.current.error).toBeNull();
  });

  it('should initialize all patients and all files as selected', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const { result } = renderHook(() => usePatients('comp-001'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All patients should be selected with all files
    expect(result.current.selectedPatients['pat-001']).toBeDefined();
    expect(result.current.selectedPatients['pat-001'].patientName).toBe('María Elena García López');
    expect(result.current.selectedPatients['pat-001'].files).toEqual(['file-001', 'file-002']);
    expect(result.current.selectedPatients['pat-002']).toBeDefined();
    expect(result.current.selectedPatients['pat-002'].files).toEqual(['file-003']);
  });

  it('should toggle patient selection', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const { result } = renderHook(() => usePatients('comp-001'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Toggle patient pat-001 off
    act(() => {
      result.current.togglePatient('pat-001');
    });

    expect(result.current.selectedPatients['pat-001']).toBeUndefined();
    // Other patient should still be selected
    expect(result.current.selectedPatients['pat-002']).toBeDefined();

    // Toggle back on
    act(() => {
      result.current.togglePatient('pat-001');
    });

    expect(result.current.selectedPatients['pat-001']).toBeDefined();
    expect(result.current.selectedPatients['pat-001'].files).toEqual(['file-001', 'file-002']);
  });

  it('should toggle file selection within a patient', async () => {
    mockExecute.mockResolvedValue(mockPatients);

    const { result } = renderHook(() => usePatients('comp-001'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Toggle off file-001 (CAMO.pdf)
    act(() => {
      result.current.toggleFile('pat-001', 'file-001');
    });

    expect(result.current.selectedPatients['pat-001'].files).toEqual(['file-002']);

    // Toggle it back on
    act(() => {
      result.current.toggleFile('pat-001', 'file-001');
    });

    expect(result.current.selectedPatients['pat-001'].files).toEqual(['file-002', 'file-001']);
  });

  it('should set error when use case fails', async () => {
    mockExecute.mockRejectedValue(new Error('Failed to load patients'));

    const { result } = renderHook(() => usePatients('comp-001'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.patients).toEqual([]);
    expect(result.current.selectedPatients).toEqual({});
    expect(result.current.error).toBe('Failed to load patients');
  });
});
