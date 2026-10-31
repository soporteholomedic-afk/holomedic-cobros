import type { ICrmEmpresaRepository } from '../domain/ports';
import { ETAPAS, type Empresa, type Etapa } from '../domain/entities';
import { EtapaInvalidaError } from '../domain/errors';

/** Move an empresa to another board column. Only the four known columns exist. */
export class MoverEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(id: string, etapa: string): Promise<Empresa> {
    if (!(ETAPAS as readonly string[]).includes(etapa)) throw new EtapaInvalidaError(etapa);
    return this.repo.updateEtapa(id, etapa as Etapa);
  }
}
