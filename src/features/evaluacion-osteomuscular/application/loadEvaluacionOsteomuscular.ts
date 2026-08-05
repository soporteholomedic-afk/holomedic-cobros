import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import type { IEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/domain/ports';

export type LoadEvaluacionResult =
  | { ok: true; data: EvaluacionOsteomuscular | null; error: null }
  | { ok: false; data: null; error: string };

/**
 * Use case: load the stored osteomuscular clinical evaluation of an
 * attention. Returns null when no evaluation has been saved yet.
 */
export class LoadEvaluacionOsteomuscularUseCase {
  constructor(private readonly repo: IEvaluacionOsteomuscularRepository) {}

  async execute(idAtencion: string): Promise<LoadEvaluacionResult> {
    if (!idAtencion?.trim()) {
      return { ok: false, data: null, error: 'idAtencion es requerido' };
    }

    try {
      const evaluacion = await this.repo.loadByAtencion(idAtencion.trim());
      return { ok: true, data: evaluacion ?? null, error: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar';
      return { ok: false, data: null, error: message };
    }
  }
}
