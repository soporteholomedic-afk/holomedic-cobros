import type { ISpitchRepository } from '../domain/ports';
import type { Spitch, SpitchType } from '../domain/entities';

export class GetSptichesUseCase {
  constructor(private readonly spitchRepo: ISpitchRepository) {}

  async execute(type: SpitchType): Promise<Spitch[]> {
    return this.spitchRepo.getByType(type);
  }
}
