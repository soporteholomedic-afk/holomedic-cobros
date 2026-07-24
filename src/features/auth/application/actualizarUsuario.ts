import type { IUsuarioRepository } from '../domain/ports';
import type { UpdateUsuarioInput, UsuarioRow } from '../domain/entities';

export class UpdateUsuarioUseCase {
  constructor(private readonly repo: IUsuarioRepository) {}

  async execute(id: string, input: UpdateUsuarioInput): Promise<UsuarioRow> {
    return this.repo.update(id, input);
  }
}
