import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ---- Mock the use case ----
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../application/getCompanies', () => ({
  GetCompaniesUseCase: vi.fn().mockImplementation(function () {
    return { execute: mockExecute };
  }),
}));

// ---- Also mock the company repo to avoid importing it ----
vi.mock('../../../infrastructure/mock/companyRepo', () => ({
  MockCompanyRepo: vi.fn(),
}));

// ---- Import under test ----
import { useCompanies } from '../useCompanies';
import type { Company } from '../../../domain/entities';

const mockCompanies: Company[] = [
  { id: 'comp-001', name: 'Clínica San Pablo', ruc: '20123456789', email: 'cp@test.pe' },
  { id: 'comp-002', name: 'Laboratorio Médico', ruc: '20234567890', email: 'lab@test.pe' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockReset();
});

describe('useCompanies', () => {
  it('should load companies and set them on mount', async () => {
    mockExecute.mockResolvedValue(mockCompanies);

    const { result } = renderHook(() => useCompanies());

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.companies).toEqual(mockCompanies);
    expect(result.current.error).toBeNull();
  });

  it('should initialize selectedCompanyId as null', () => {
    mockExecute.mockResolvedValue(mockCompanies);

    const { result } = renderHook(() => useCompanies());

    expect(result.current.selectedCompanyId).toBeNull();
  });

  it('should update selectedCompanyId when selectCompany is called', async () => {
    mockExecute.mockResolvedValue(mockCompanies);

    const { result } = renderHook(() => useCompanies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectCompany('comp-002');
    });

    expect(result.current.selectedCompanyId).toBe('comp-002');
  });

  it('should set error when the use case fails', async () => {
    mockExecute.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCompanies());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.companies).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });
});
