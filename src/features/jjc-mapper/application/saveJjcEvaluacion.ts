import type { JjcEvaluacion, Fototipo, Fotoprotector, CuestionarioPiel } from '@/types/jjc';
import type { IJjcEvaluacionRepository } from '@/features/jjc-mapper/domain/ports';
import { FOTOTIPO_VALUES, FOTOPROTECTOR_VALUES } from '@/features/jjc-mapper/domain/entities';

/**
 * Result of a save operation (domain outcome, not HTTP status).
 */
export type SaveEvaluacionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Use case: save (upsert) a JJC evaluation.
 *
 * Validates business rules before persisting:
 * - idAtencion must be non-empty
 * - fototipo must be one of the accepted values
 * - fechaEvaluacion must be a parseable date ≤ today
 * - observaciones capped at 500 chars
 * - lesiones must be valid
 */
export class SaveJjcEvaluacionUseCase {
  constructor(private readonly repo: IJjcEvaluacionRepository) {}

  async execute(input: SaveInput): Promise<SaveEvaluacionResult> {
    const validation = validateInput(input);
    if (!validation.ok) return { ok: false, error: validation.error };

    const evaluacion: JjcEvaluacion = {
      idAtencion: input.idAtencion.trim(),
      fechaEvaluacion: input.fechaEvaluacion,
      lugar: 'HOLOMEDIC',
      fototipo: input.fototipo,
      fotoprotector: input.fotoprotector ?? 'FPS recomendado +90',
      observaciones: (input.observaciones ?? '').slice(0, 500),
      lesiones: (input.lesiones ?? []) as JjcEvaluacion['lesiones'],
      preguntas: input.preguntas ?? null,
      createdBy: input.createdBy ?? null,
    };

    try {
      await this.repo.save(evaluacion);
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al guardar';
      return { ok: false, error: message };
    }
  }
}

export interface SaveInput {
  idAtencion: string;
  fechaEvaluacion: string;
  fototipo: Fototipo;
  fotoprotector?: Fotoprotector | null;
  observaciones?: string;
  lesiones?: Array<{ id: string; type: string; x: number; y: number }>;
  preguntas?: CuestionarioPiel | null;
  createdBy?: string | null;
}

function validateInput(input: SaveInput): { ok: true } | { ok: false; error: string } {
  if (!input.idAtencion?.trim()) {
    return { ok: false, error: 'idAtencion es requerido' };
  }

  if (!input.fechaEvaluacion) {
    return { ok: false, error: 'fechaEvaluacion es requerida' };
  }

  const date = new Date(input.fechaEvaluacion);
  if (isNaN(date.getTime())) {
    return { ok: false, error: 'fechaEvaluacion no es una fecha válida' };
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) {
    return { ok: false, error: 'fechaEvaluacion no puede ser futura' };
  }

  if (!input.fototipo || !(FOTOTIPO_VALUES as readonly string[]).includes(input.fototipo)) {
    return { ok: false, error: 'fototipo es requerido (I-II, III-IV, V-VI)' };
  }

  if (input.fotoprotector != null && !(FOTOPROTECTOR_VALUES as readonly string[]).includes(input.fotoprotector)) {
    return { ok: false, error: 'fotoprotector no válido' };
  }

  return { ok: true };
}
