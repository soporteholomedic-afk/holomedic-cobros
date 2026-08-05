import { describe, it, expect, vi } from 'vitest';
import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { IEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/domain/ports';
import { initialEntrevistaState } from '@/features/entrevista-osteomuscular/presentation/hooks/useEntrevistaOsteomuscular';
import { SaveEntrevistaOsteomuscularUseCase } from '../saveEntrevistaOsteomuscular';

function buildEntrevista(): EntrevistaOsteomuscular {
  const entrevista = initialEntrevistaState(null);
  return { ...entrevista, idAtencion: 'AT-1001' };
}

function makeRepo(save = vi.fn().mockResolvedValue(undefined)): IEntrevistaOsteomuscularRepository {
  return { save, loadByAtencion: vi.fn().mockResolvedValue(null) };
}

describe('SaveEntrevistaOsteomuscularUseCase', () => {
  it('guarda la entrevista con el idAtencion recortado', async () => {
    const repo = makeRepo();
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute({
      idAtencion: '  AT-1001  ',
      entrevista: buildEntrevista(),
    });

    expect(result).toEqual({ ok: true });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ idAtencion: 'AT-1001' }),
    );
  });

  it('rechaza idAtencion vacío sin tocar el repositorio', async () => {
    const repo = makeRepo();
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute({ idAtencion: ' ', entrevista: buildEntrevista() });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('idAtencion');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza payload sin entrevista o sin columna', async () => {
    const repo = makeRepo();
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const sinEntrevista = await useCase.execute({ idAtencion: 'AT-1001', entrevista: null });
    expect(sinEntrevista.ok).toBe(false);

    const entrevista = buildEntrevista();
    const sinColumna = await useCase.execute({
      idAtencion: 'AT-1001',
      entrevista: { ...entrevista, columna: undefined },
    });
    expect(sinColumna.ok).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('valida formato y longitud de detalleIrradiacion en las tres secciones', async () => {
    const repo = makeRepo();
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const secciones = ['cervical', 'dorsal', 'lumboSacra'] as const;
    for (const seccion of secciones) {
      const entrevista = buildEntrevista();
      entrevista.columna[seccion].irradiacion.detalleIrradiacion = 'no válido ###';

      const result = await useCase.execute({ idAtencion: 'AT-1001', entrevista });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(seccion);

      const larga = buildEntrevista();
      larga.columna[seccion].irradiacion.detalleIrradiacion = 'a'.repeat(101);
      const resultLarga = await useCase.execute({ idAtencion: 'AT-1001', entrevista: larga });
      expect(resultLarga.ok).toBe(false);
    }
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('acepta detalleIrradiacion vacío (campo opcional)', async () => {
    const repo = makeRepo();
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute({ idAtencion: 'AT-1001', entrevista: buildEntrevista() });
    expect(result).toEqual({ ok: true });
  });

  it('devuelve error tipado cuando el repositorio lanza', async () => {
    const repo = makeRepo(vi.fn().mockRejectedValue(new Error('DB down')));
    const useCase = new SaveEntrevistaOsteomuscularUseCase(repo);

    const result = await useCase.execute({ idAtencion: 'AT-1001', entrevista: buildEntrevista() });
    expect(result).toEqual({ ok: false, error: 'DB down' });
  });
});
