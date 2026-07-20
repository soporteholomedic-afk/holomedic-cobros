import type { JjcEvaluacion } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';

/**
 * Use case: load a JJC evaluation by idAtencion.
 *
 * Returns the evaluation or null when none exists.
 * Wraps repository errors into a typed result.
 */
export class LoadJjcEvaluacionUseCase {
  constructor(private readonly repo: IJjcEvaluacionRepository) {}

  async execute(idAtencion: string): Promise<LoadEvaluacionResult> {
    if (!idAtencion?.trim()) {
      return { ok: false as const, error: 'idAtencion es requerido', data: null };
    }

    try {
      const evaluacion = await this.repo.loadByAtencion(idAtencion.trim());
      return { ok: true as const, data: evaluacion ?? null, error: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar';
      return { ok: false as const, data: null, error: message };
    }
  }
}

export type LoadEvaluacionResult =
  | { ok: true; data: JjcEvaluacion | null; error: null }
  | { ok: false; data: null; error: string };
