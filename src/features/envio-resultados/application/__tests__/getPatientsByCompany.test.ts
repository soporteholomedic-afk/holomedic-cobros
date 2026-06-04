import { describe, it, expect, vi } from 'vitest';
import { GetPatientsByCompanyUseCase } from '../getPatientsByCompany';
import type { Patient } from '../../domain/entities';

describe('GetPatientsByCompanyUseCase', () => {
  it('should return patients for a given company ID', async () => {
    const mockPatients: Patient[] = [
      {
        id: 'pat-001',
        companyId: 'comp-001',
        name: 'Paciente Uno',
        dni: '12345678',
        files: [],
      },
      {
        id: 'pat-002',
        companyId: 'comp-001',
        name: 'Paciente Dos',
        dni: '87654321',
        files: [],
      },
    ];

    const mockRepo = {
      getByCompanyId: vi.fn().mockImplementation((id: string) =>
        Promise.resolve(mockPatients.filter((p) => p.companyId === id))
      ),
    };

    const useCase = new GetPatientsByCompanyUseCase(mockRepo);
    const result = await useCase.execute('comp-001');

    expect(result).toHaveLength(2);
    expect(mockRepo.getByCompanyId).toHaveBeenCalledWith('comp-001');
  });

  it('should return empty array for unknown company', async () => {
    const mockRepo = {
      getByCompanyId: vi.fn().mockResolvedValue([]),
    };

    const useCase = new GetPatientsByCompanyUseCase(mockRepo);
    const result = await useCase.execute('comp-unknown');

    expect(result).toHaveLength(0);
  });
});
