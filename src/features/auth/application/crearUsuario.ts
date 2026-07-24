import type { IUsuarioRepository } from '../domain/ports';
import type { CreateUsuarioInput, UsuarioRow } from '../domain/entities';

export class CreateUsuarioUseCase {
  constructor(private readonly repo: IUsuarioRepository) {}

  async execute(input: CreateUsuarioInput): Promise<UsuarioRow> {
    return this.repo.create(input);
  }
}
