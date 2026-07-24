import type { IUsuarioRepository } from '../domain/ports';

export class DeleteUsuarioUseCase {
  constructor(private readonly repo: IUsuarioRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
