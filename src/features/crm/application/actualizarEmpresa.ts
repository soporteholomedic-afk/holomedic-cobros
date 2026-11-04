import type { ICrmEmpresaRepository } from '../domain/ports';
import type { EditarEmpresaDatos, Empresa } from '../domain/entities';
import { EmpresaNotFoundError } from '../domain/errors';
import { validarDatosEmpresa } from './validar';

/**
 * Edit an empresa's data and replace its contacts list. Stage, medium and
 * loss reason are untouched: they have their own use cases.
 */
export class ActualizarEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(id: string, datos: EditarEmpresaDatos): Promise<Empresa> {
    if (!(await this.repo.getById(id))) throw new EmpresaNotFoundError(id);
    const validos = await validarDatosEmpresa(datos, this.repo, id);
    return this.repo.update(id, validos);
  }
}
