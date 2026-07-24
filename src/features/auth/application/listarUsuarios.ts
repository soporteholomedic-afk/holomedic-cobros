import type { IUsuarioRepository } from '../domain/ports';
import type { UsuarioRow } from '../domain/entities';

export class ListUsuariosUseCase {
  constructor(private readonly repo: IUsuarioRepository) {}

  async execute(): Promise<UsuarioRow[]> {
    return this.repo.list();
  }
}
