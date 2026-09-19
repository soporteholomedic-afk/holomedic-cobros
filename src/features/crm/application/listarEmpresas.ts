import type { Empresa } from '../domain/entities';
import type { CrmEmpresaRepositoryPort, FiltrosEmpresas } from '../domain/ports';

/**
 * ListarEmpresasUseCase (spec G1) — thin orchestration over the port's
 * filtered query. Filter semantics live in the port contract
 * (`FiltrosEmpresas`): `q` case-insensitive substring over
 * razonSocial/RUC, `tipo` exact, `responsable` exact with `null`
 * targeting the unassigned pool. The `etapa` filter joins when the
 * pipeline lands (pr9+), per the port note.
 */
export class ListarEmpresasUseCase {
  constructor(private readonly repo: CrmEmpresaRepositoryPort) {}

  execute(filtros?: FiltrosEmpresas): Promise<Empresa[]> {
    return this.repo.listar(filtros);
  }
}
