import type { FiltrosConversaciones, ListadoConversaciones } from '../domain/ports';
import type { ConversacionCrmRepository } from '../domain/ports';

/**
 * ListarConversacionesUseCase (agente-ia-crm E1) — thin orchestration
 * over the port's bandeja query (ListarEmpresas precedent): filter
 * semantics (busqueda/estado) and paging live in the port contract;
 * the page carries its own total so the view paginates without a
 * second unfiltered fetch.
 */
export class ListarConversacionesUseCase {
  constructor(private readonly repo: ConversacionCrmRepository) {}

  ejecutar(filtros?: FiltrosConversaciones): Promise<ListadoConversaciones> {
    return this.repo.listar(filtros);
  }
}
