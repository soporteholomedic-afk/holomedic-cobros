import type { AtencionDetalle } from '@/types/jjc';
import type { IAtencionRepository } from '@/features/jjc-mapper/domain/ports';

/**
 * Use case: fetch attention detail for the JJC face-lesion-mapper page.
 *
 * Orchestrates the repository call and returns a typed result.
 * This runs server-side in the RSC page — no client boundary.
 */
export class GetAtencionDetalleUseCase {
  constructor(private readonly repo: IAtencionRepository) {}

  async execute(idAtencion: string): Promise<AtencionDetalle | null> {
    if (!idAtencion.trim()) return null;
    return this.repo.getDetalle(idAtencion.trim());
  }
}
