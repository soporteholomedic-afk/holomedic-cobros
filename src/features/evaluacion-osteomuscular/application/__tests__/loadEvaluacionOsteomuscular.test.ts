import { describe, it, expect, vi, type Mock } from 'vitest';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import type { IEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/domain/ports';
import { initialEvaluacionState } from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';
import { LoadEvaluacionOsteomuscularUseCase } from '../loadEvaluacionOsteomuscular';

function makeRepo(
  loadByAtencion: Mock = vi.fn().mockResolvedValue(null),
): IEvaluacionOsteomuscularRepository {
  return { save: vi.fn(), loadByAtencion };
}

describe('LoadEvaluacionOsteomuscularUseCase', () => {
  it('devuelve la evaluación almacenada', async () => {
    const stored: EvaluacionOsteomuscular = {
      ...initialEvaluacionState(null),
      idAtencion: 'AT-1001',
    };
    stored.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo = 'GRAVE';
    const repo = makeRepo(vi.fn().mockResolvedValue(stored));
    const useCase = new LoadEvaluacionOsteomuscularUseCase(repo);

    const result = await useCase.execute(' AT-1001 ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.evaluacionClinicaOsteomuscular.miembrosSuperiores.codo.gravedadPatologiaCodo).toBe('GRAVE');
    }
    expect(repo.loadByAtencion).toHaveBeenCalledWith('AT-1001');
  });

  it('devuelve data null cuando no hay evaluación guardada', async () => {
    const useCase = new LoadEvaluacionOsteomuscularUseCase(makeRepo());

    const result = await useCase.execute('AT-9999');

    expect(result).toEqual({ ok: true, data: null, error: null });
  });

  it('rechaza idAtencion vacío', async () => {
    const useCase = new LoadEvaluacionOsteomuscularUseCase(makeRepo());

    const result = await useCase.execute(' ');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('idAtencion');
  });

  it('devuelve error tipado cuando el repositorio lanza', async () => {
    const repo = makeRepo(vi.fn().mockRejectedValue(new Error('timeout')));
    const useCase = new LoadEvaluacionOsteomuscularUseCase(repo);

    const result = await useCase.execute('AT-1001');

    expect(result).toEqual({ ok: false, data: null, error: 'timeout' });
  });
});
