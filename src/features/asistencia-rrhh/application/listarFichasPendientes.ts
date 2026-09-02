import type { Empleado } from '../domain/entities';
import type { IEmpleadoRepository } from '../domain/ports';

/**
 * RRHH pending-fichas queue (REQ-F1-13). The repository owns the
 * estado filter (PENDIENTE_FICHA); the use case orders the queue OLDEST
 * FIRST (createdAt ASC) so the ficha waiting longest is completed
 * first. Ties keep the repository order (stable sort) and the fichas
 * are presented unmutated.
 */
export interface ListarFichasPendientesDeps {
  empleados: IEmpleadoRepository;
}

export class ListarFichasPendientesUseCase {
  constructor(private readonly deps: ListarFichasPendientesDeps) {}

  async execute(): Promise<Empleado[]> {
    const fichas = await this.deps.empleados.pendientes();
    return [...fichas].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }
}
