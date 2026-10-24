import type { IAreaRepository } from '../domain/ports';
import type { Area } from '../domain/entities';

export class ListarAreasUseCase {
  constructor(private readonly repo: IAreaRepository) {}

  async execute(): Promise<Area[]> {
    return this.repo.list();
  }
}
