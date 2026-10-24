import type { Area, CreateAreaInput, UpdateAreaInput } from './entities';

export interface IAreaRepository {
  getById(id: string): Promise<Area | null>;
  /** Exact-name lookup across active AND inactive rows (duplicate guard). */
  findByNombre(nombre: string): Promise<Area | null>;
  list(): Promise<Area[]>;
  create(input: CreateAreaInput): Promise<Area>;
  /**
   * Partial update; throws `AreaNotFoundError` when the id is unknown.
   */
  update(id: string, input: UpdateAreaInput): Promise<Area>;
  /** Soft delete (activo = 0); throws `AreaNotFoundError` when unknown. */
  softDelete(id: string): Promise<void>;
}
