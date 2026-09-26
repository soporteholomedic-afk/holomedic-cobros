import type { Empresa } from '../domain/entities';
import { NotFoundError } from '../domain/errors';
import type { CrmEmpresaRepositoryPort } from '../domain/ports';

/**
 * ObtenerEmpresaUseCase (spec G1) — port lookup translated into the
 * typed error surface: a missing id raises `NotFoundError` (pr4 API
 * route maps it to HTTP 404) instead of leaking a nullable contract
 * upward.
 */
export class ObtenerEmpresaUseCase {
  constructor(private readonly repo: CrmEmpresaRepositoryPort) {}

  async execute(id: number): Promise<Empresa> {
    const empresa = await this.repo.obtenerPorId(id);
    if (!empresa) throw new NotFoundError();
    return empresa;
  }
}
