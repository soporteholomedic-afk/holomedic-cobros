import { describe, it, expect } from 'vitest';
import type { JjcEvaluacion } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';
import { SaveJjcEvaluacionUseCase } from '../saveJjcEvaluacion';
import type { SaveInput } from '../saveJjcEvaluacion';

/** In-memory fake repository for testing. */
class FakeRepo implements IJjcEvaluacionRepository {
  private store = new Map<string, JjcEvaluacion>();

  async save(evaluacion: JjcEvaluacion): Promise<void> {
    this.store.set(evaluacion.idAtencion, { ...evaluacion });
  }

  async loadByAtencion(id: string): Promise<JjcEvaluacion | null> {
    return this.store.get(id) ?? null;
  }

  get saved(): JjcEvaluacion[] {
    return Array.from(this.store.values());
  }
}

function makeSut(repo?: IJjcEvaluacionRepository) {
  const r = repo ?? new FakeRepo();
  const useCase = new SaveJjcEvaluacionUseCase(r);
  return { useCase, repo: r as FakeRepo };
}

function validInput(overrides: Partial<SaveInput> = {}): SaveInput {
  return {
    idAtencion: '01001000001',
    fechaEvaluacion: '2026-07-20',
    fototipo: 'III-IV',
    observaciones: '',
    lesiones: [],
    ...overrides,
  };
}

describe('SaveJjcEvaluacionUseCase', () => {
  it('saves a valid evaluation and returns ok', async () => {
    const { useCase, repo } = makeSut();
    const input = validInput();

    const result = await useCase.execute(input);

    expect(result).toEqual({ ok: true });
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].idAtencion).toBe('01001000001');
    expect(repo.saved[0].fototipo).toBe('III-IV');
  });

  it('rejects empty idAtencion', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ idAtencion: '' }));
    expect(result).toEqual({ ok: false, error: 'idAtencion es requerido' });
  });

  it('rejects missing fototipo', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ fototipo: '' as never }));
    expect(result).toEqual({ ok: false, error: 'fototipo es requerido (I-II, III-IV, V-VI)' });
  });

  it('rejects invalid fototipo', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ fototipo: 'INVALID' as never }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('fototipo') });
  });

  it('rejects missing fechaEvaluacion', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ fechaEvaluacion: '' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('fechaEvaluacion') });
  });

  it('rejects future fechaEvaluacion', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ fechaEvaluacion: '2099-01-01' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('futura') });
  });

  it('rejects invalid date string', async () => {
    const { useCase } = makeSut();
    const result = await useCase.execute(validInput({ fechaEvaluacion: 'not-a-date' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('válida') });
  });

  it('crops observaciones to 500 chars', async () => {
    const { useCase, repo } = makeSut();
    const longText = 'x'.repeat(600);
    const result = await useCase.execute(validInput({ observaciones: longText }));

    expect(result).toEqual({ ok: true });
    expect(repo.saved[0].observaciones).toHaveLength(500);
  });

  it('preserves createdBy when provided', async () => {
    const { useCase, repo } = makeSut();
    const result = await useCase.execute(validInput({ createdBy: 'user-001' }));

    expect(result).toEqual({ ok: true });
    expect(repo.saved[0].createdBy).toBe('user-001');
  });

  it('sets createdBy to null when omitted', async () => {
    const { useCase, repo } = makeSut();
    const result = await useCase.execute(validInput());

    expect(result).toEqual({ ok: true });
    expect(repo.saved[0].createdBy).toBeNull();
  });
});
