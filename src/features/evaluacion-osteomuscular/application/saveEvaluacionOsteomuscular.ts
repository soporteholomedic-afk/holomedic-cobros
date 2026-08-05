import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';
import type { IEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/domain/ports';

export type SaveEvaluacionResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SaveEvaluacionInput {
  idAtencion: string;
  evaluacion: unknown;
}

/**
 * Use case: save (upsert) the osteomuscular clinical evaluation of an
 * attention.
 *
 * Validates the external payload before persisting:
 * - idAtencion must be non-empty
 * - the payload must be a non-null object carrying the clinical evaluation
 *   (the full document travels as JSON, like the interview)
 */
export class SaveEvaluacionOsteomuscularUseCase {
  constructor(private readonly repo: IEvaluacionOsteomuscularRepository) {}

  async execute(input: SaveEvaluacionInput): Promise<SaveEvaluacionResult> {
    if (!input.idAtencion?.trim()) {
      return { ok: false, error: 'idAtencion es requerido' };
    }

    if (!input.evaluacion || typeof input.evaluacion !== 'object') {
      return { ok: false, error: 'evaluacion es requerida' };
    }

    const evaluacion = input.evaluacion as EvaluacionOsteomuscular;
    if (!evaluacion.evaluacionClinicaOsteomuscular || typeof evaluacion.evaluacionClinicaOsteomuscular !== 'object') {
      return { ok: false, error: 'evaluacion.evaluacionClinicaOsteomuscular es requerida' };
    }

    try {
      await this.repo.save({
        ...evaluacion,
        idAtencion: input.idAtencion.trim(),
      });
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al guardar';
      return { ok: false, error: message };
    }
  }
}
