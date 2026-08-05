import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { IEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/domain/ports';

export type LoadEntrevistaResult =
  | { ok: true; data: EntrevistaOsteomuscular | null; error: null }
  | { ok: false; data: null; error: string };

/**
 * Use case: load the stored osteomuscular interview of an attention.
 * Returns null when no interview has been saved yet.
 */
export class LoadEntrevistaOsteomuscularUseCase {
  constructor(private readonly repo: IEntrevistaOsteomuscularRepository) {}

  async execute(idAtencion: string): Promise<LoadEntrevistaResult> {
    if (!idAtencion?.trim()) {
      return { ok: false, data: null, error: 'idAtencion es requerido' };
    }

    try {
      const entrevista = await this.repo.loadByAtencion(idAtencion.trim());
      return { ok: true, data: entrevista ?? null, error: null };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar';
      return { ok: false, data: null, error: message };
    }
  }
}
