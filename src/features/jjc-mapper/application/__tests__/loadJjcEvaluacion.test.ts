import { describe, it, expect } from 'vitest';
import type { JjcEvaluacion } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';
import { LoadJjcEvaluacionUseCase } from '../loadJjcEvaluacion';

class FakeRepo implements IJjcEvaluacionRepository {
  private store = new Map<string, JjcEvaluacion>();

  async save(evaluacion: JjcEvaluacion): Promise<void> {
    this.store.set(evaluacion.idAtencion, { ...evaluacion });
  }

  async loadByAtencion(id: string): Promise<JjcEvaluacion | null> {
    return this.store.get(id) ?? null;
  }
}

function makeSut(repo?: IJjcEvaluacionRepository) {
  const r = repo ?? new FakeRepo();
  const useCase = new LoadJjcEvaluacionUseCase(r);
  return { useCase, repo: r as FakeRepo };
}

describe('LoadJjcEvaluacionUseCase', () => {
  it('returns null when no evaluation exists', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute('01001000001');

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('returns evaluation when one exists', async () => {
    const { useCase, repo } = makeSut();
    await repo.save({
      idAtencion: '01001000001',
      fechaEvaluacion: '2026-07-20',
      lugar: 'HOLOMEDIC',
      fototipo: 'III-IV',
      observaciones: 'Sin novedad',
      lesiones: [{ id: 'p1', type: 'P', x: 0.5, y: 0.3 }],
      preguntas: null,
    });

    const result = await useCase.execute('01001000001');

    expect(result.ok).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.fototipo).toBe('III-IV');
    expect(result.data!.lesiones).toHaveLength(1);
  });

  it('returns error for empty idAtencion', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute('');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('idAtencion es requerido');
  });

  it('captures repository errors', async () => {
    const failingRepo: IJjcEvaluacionRepository = {
      save: async () => { throw new Error('DB failure'); },
      loadByAtencion: async () => { throw new Error('DB failure'); },
    };
    const { useCase } = makeSut(failingRepo);
    const result = await useCase.execute('01001000001');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('DB failure');
  });
});
