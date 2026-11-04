import type { ICrmEmpresaRepository } from '../domain/ports';
import type { CrearEmpresaDatos, Empresa } from '../domain/entities';
import { validarDatosEmpresa } from './validar';

/**
 * Create an empresa in the first board column ("Por contactar").
 * Validates before touching storage: a rejected input stores nothing.
 */
export class CrearEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(datos: CrearEmpresaDatos): Promise<Empresa> {
    const validos = await validarDatosEmpresa(datos, this.repo);
    return this.repo.create({ ...validos, etapa: 'por_contactar', origen: null });
  }
}
