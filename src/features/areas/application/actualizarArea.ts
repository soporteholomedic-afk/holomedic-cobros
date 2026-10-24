import type { IAreaRepository } from '../domain/ports';
import type { Area, UpdateAreaInput } from '../domain/entities';
import { AreaDuplicadaError } from '../domain/errors';

/**
 * Update an area. Renaming is guarded against colliding with another
 * ACTIVE area's name; renaming to the area's own name is a no-op pass
 * through. Unknown ids surface the repository's AreaNotFoundError.
 */
export class ActualizarAreaUseCase {
  constructor(private readonly repo: IAreaRepository) {}

  async execute(id: string, input: UpdateAreaInput): Promise<Area> {
    if (input.nombre !== undefined) {
      const nombre = input.nombre.trim();
      const existing = await this.repo.findByNombre(nombre);
      if (existing && existing.idArea !== id && existing.activo) {
        throw new AreaDuplicadaError(nombre);
      }
      return this.repo.update(id, { ...input, nombre });
    }

    return this.repo.update(id, input);
  }
}
