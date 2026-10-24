import type { IAreaRepository } from '../domain/ports';

export class EliminarAreaUseCase {
  constructor(private readonly repo: IAreaRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
