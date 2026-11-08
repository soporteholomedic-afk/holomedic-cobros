import type { Oportunidad } from '../domain/entities';
import type { ICrmOportunidadRepository } from '../domain/ports';

/** All oportunidades of all empresas (the Kanban source), newest first. */
export class ListarOportunidadesUseCase {
  constructor(private readonly repo: ICrmOportunidadRepository) {}

  async execute(): Promise<Oportunidad[]> {
    return this.repo.list();
  }
}
