import type { IAreaRepository } from '../domain/ports';
import type { Area, CreateAreaInput } from '../domain/entities';
import { AreaDuplicadaError } from '../domain/errors';

/**
 * Create an area, or reactivate a soft-deleted one with the same name.
 *
 * Re-creating a previously deleted name must NOT fail (the filtered
 * unique index only covers active rows): the existing row is flipped
 * back to active with the new descripcion instead of inserting a
 * confusing duplicate.
 */
export class CrearAreaUseCase {
  constructor(private readonly repo: IAreaRepository) {}

  async execute(input: CreateAreaInput): Promise<Area> {
    const nombre = input.nombre.trim();

    const existing = await this.repo.findByNombre(nombre);
    if (existing) {
      if (existing.activo) throw new AreaDuplicadaError(nombre);
      return this.repo.update(existing.idArea, {
        descripcion: input.descripcion ?? null,
        activo: true,
      });
    }

    return this.repo.create({ nombre, descripcion: input.descripcion ?? null });
  }
}
