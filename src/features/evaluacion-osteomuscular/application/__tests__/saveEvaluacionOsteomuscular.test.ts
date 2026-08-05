import { describe, it, expect, vi } from 'vitest';
import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import type { IEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/domain/ports';
import { initialEvaluacionState } from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';
import { SaveEvaluacionOsteomuscularUseCase } from '../saveEvaluacionOsteomuscular';

function buildEvaluacion(): EvaluacionOsteomuscular {
  const evaluacion = initialEvaluacionState(null);
  return { ...evaluacion, idAtencion: 'AT-1001' };
}

function makeRepo(save = vi.fn().mockResolvedValue(undefined)): IEvaluacionOsteomuscularRepository {
  return { save, loadByAtencion: vi.fn().mockResolvedValue(null) };
}

describe('SaveEvaluacionOsteomuscularUseCase', () => {
  it('guarda la evaluación con el idAtencion recortado', async () => {
    const repo = makeRepo();
    const useCase = new SaveEvaluacionOsteomuscularUseCase(repo);

    const result = await useCase.execute({
      idAtencion: '  AT-1001  ',
      evaluacion: buildEvaluacion(),
    });

    expect(result).toEqual({ ok: true });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ idAtencion: 'AT-1001' }),
    );
  });

  it('rechaza idAtencion vacío sin tocar el repositorio', async () => {
    const repo = makeRepo();
    const useCase = new SaveEvaluacionOsteomuscularUseCase(repo);

    const result = await useCase.execute({ idAtencion: ' ', evaluacion: buildEvaluacion() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('idAtencion');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza payload sin evaluación o sin evaluacionClinicaOsteomuscular', async () => {
    const repo = makeRepo();
    const useCase = new SaveEvaluacionOsteomuscularUseCase(repo);

    const sinEvaluacion = await useCase.execute({ idAtencion: 'AT-1001', evaluacion: null });
    expect(sinEvaluacion.ok).toBe(false);

    const evaluacion = buildEvaluacion();
    const sinSeccion = await useCase.execute({
      idAtencion: 'AT-1001',
      evaluacion: { ...evaluacion, evaluacionClinicaOsteomuscular: undefined },
    });
    expect(sinSeccion.ok).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('devuelve error tipado cuando el repositorio lanza', async () => {
    const repo = makeRepo(vi.fn().mockRejectedValue(new Error('DB down')));
    const useCase = new SaveEvaluacionOsteomuscularUseCase(repo);

    const result = await useCase.execute({ idAtencion: 'AT-1001', evaluacion: buildEvaluacion() });
    expect(result).toEqual({ ok: false, error: 'DB down' });
  });
});
