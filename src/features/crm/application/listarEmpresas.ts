import type { ICrmEmpresaRepository } from '../domain/ports';
import type { Empresa } from '../domain/entities';

export class ListarEmpresasUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(): Promise<Empresa[]> {
    return this.repo.list();
  }
}
