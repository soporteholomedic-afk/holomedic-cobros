import type { ICrmEmpresaRepository } from '../domain/ports';
import type { Interaccion } from '../domain/entities';
import { EmpresaNotFoundError } from '../domain/errors';

/** Contact history of an empresa, newest first. */
export class ListarHistorialUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(idEmpresa: string): Promise<Interaccion[]> {
    if (!(await this.repo.getById(idEmpresa))) throw new EmpresaNotFoundError(idEmpresa);
    return this.repo.listInteracciones(idEmpresa);
  }
}
