import { describe, it, expect, vi } from 'vitest';
import { GetSptichesUseCase } from '../getSptiches';
import type { Spitch, SpitchType } from '../../domain/entities';

describe('GetSptichesUseCase', () => {
  const mockSpitches: Spitch[] = [
    { id: 'sp-001', type: 'company', name: 'Resumen', subject: 'Subj', bodyHtml: '<p>1</p>' },
    { id: 'sp-002', type: 'company', name: 'Detalle', subject: 'Subj', bodyHtml: '<p>2</p>' },
    { id: 'sp-003', type: 'patient', name: 'Notif', subject: 'Subj', bodyHtml: '<p>3</p>' },
  ];

  it('should return spitches filtered by company type', async () => {
    const mockRepo = {
      getByType: vi.fn().mockImplementation((type: SpitchType) =>
        Promise.resolve(mockSpitches.filter((s) => s.type === type))
      ),
    };

    const useCase = new GetSptichesUseCase(mockRepo);
    const result = await useCase.execute('company');

    expect(result).toHaveLength(2);
    result.forEach((s) => expect(s.type).toBe('company'));
  });

  it('should return spitches filtered by patient type', async () => {
    const mockRepo = {
      getByType: vi.fn().mockImplementation((type: SpitchType) =>
        Promise.resolve(mockSpitches.filter((s) => s.type === type))
      ),
    };

    const useCase = new GetSptichesUseCase(mockRepo);
    const result = await useCase.execute('patient');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('patient');
  });

  it('should return empty array when no spitches match type', async () => {
    const mockRepo = {
      getByType: vi.fn().mockResolvedValue([] as Spitch[]),
    };

    const useCase = new GetSptichesUseCase(mockRepo);
    const result = await useCase.execute('company' as SpitchType);

    expect(result).toHaveLength(0);
  });
});
