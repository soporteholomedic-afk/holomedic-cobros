import { describe, it, expect, vi, type Mock } from 'vitest';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { IEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/domain/ports';
import { initialEntrevistaState } from '@/features/entrevista-osteomuscular/presentation/hooks/useEntrevistaOsteomuscular';
import { LoadEntrevistaOsteomuscularUseCase } from '../loadEntrevistaOsteomuscular';

function makeRepo(
  loadByAtencion: Mock = vi.fn().mockResolvedValue(null),
): IEntrevistaOsteomuscularRepository {
  return { save: vi.fn(), loadByAtencion };
}

describe('LoadEntrevistaOsteomuscularUseCase', () => {
  it('devuelve la entrevista almacenada', async () => {
    const stored: EntrevistaOsteomuscular = {
      ...initialEntrevistaState(null),
      idAtencion: 'AT-1001',
    };
    stored.columna.cervical.irradiacion.detalleIrradiacion = 'Hombro derecho';
    const repo = makeRepo(vi.fn().mockResolvedValue(stored));
    const useCase = new LoadEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute(' AT-1001 ');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.columna.cervical.irradiacion.detalleIrradiacion).toBe('Hombro derecho');
    }
    expect(repo.loadByAtencion).toHaveBeenCalledWith('AT-1001');
  });

  it('devuelve data null cuando no hay entrevista guardada', async () => {
    const useCase = new LoadEntrevistaOsteomuscularUseCase(makeRepo());

    const result = await useCase.execute('AT-9999');

    expect(result).toEqual({ ok: true, data: null, error: null });
  });

  it('rechaza idAtencion vacío', async () => {
    const useCase = new LoadEntrevistaOsteomuscularUseCase(makeRepo());

    const result = await useCase.execute(' ');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('idAtencion');
  });

  it('devuelve error tipado cuando el repositorio lanza', async () => {
    const repo = makeRepo(vi.fn().mockRejectedValue(new Error('timeout')));
    const useCase = new LoadEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute('AT-1001');

    expect(result).toEqual({ ok: false, data: null, error: 'timeout' });
  });
});
