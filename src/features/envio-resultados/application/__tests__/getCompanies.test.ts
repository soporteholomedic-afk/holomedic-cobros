import { describe, it, expect, vi } from 'vitest';
import { GetCompaniesUseCase } from '../getCompanies';
import type { Company } from '../../domain/entities';

describe('GetCompaniesUseCase', () => {
  it('should return companies from the repository', async () => {
    const mockCompanies: Company[] = [
      { id: 'comp-001', name: 'Test Company', ruc: '20123456789', email: 'test@test.com' },
    ];

    const mockRepo = {
      getAll: vi.fn().mockResolvedValue(mockCompanies),
    };

    const useCase = new GetCompaniesUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toEqual(mockCompanies);
    expect(mockRepo.getAll).toHaveBeenCalledOnce();
  });

  it('should return empty array when no companies exist', async () => {
    const mockRepo = {
      getAll: vi.fn().mockResolvedValue([]),
    };

    const useCase = new GetCompaniesUseCase(mockRepo);
    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });
});
