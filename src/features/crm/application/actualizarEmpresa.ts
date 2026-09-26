import type { ActualizarEmpresaInput, Empresa } from '../domain/entities';
import { NotFoundError, ValidationError } from '../domain/errors';
import type { CrmEmpresaRepositoryPort } from '../domain/ports';

/**
 * ActualizarEmpresaUseCase (spec G1) — applies empresa-level changes
 * (razonSocial/tipo/origen/proyecto/destino/notas/responsable) through
 * the port. RUC and contactos are intentionally NOT updatable here
 * (`ActualizarEmpresaInput` carries neither): identity fields change
 * via the import flow (pr6), contactos via dedicated flows.
 * A missing id raises `NotFoundError` (HTTP 404 in pr4).
 */
export class ActualizarEmpresaUseCase {
  constructor(private readonly repo: CrmEmpresaRepositoryPort) {}

  async execute(id: number, cambios: ActualizarEmpresaInput): Promise<Empresa> {
    if (cambios.razonSocial !== undefined && cambios.razonSocial.trim() === '') {
      throw new ValidationError('La razón social es obligatoria');
    }
    const actualizada = await this.repo.actualizar(id, cambios);
    if (!actualizada) throw new NotFoundError();
    return actualizada;
  }
}
