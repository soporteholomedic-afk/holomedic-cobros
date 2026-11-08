import type { Oportunidad } from '../domain/entities';
import type { ICrmOportunidadRepository } from '../domain/ports';
import { validarDatosOportunidad } from './validar';
import type { DatosOportunidadEntrada } from './validar';

/** Raw edit form data as received from the API (not yet validated). */
export type EditarOportunidadDatos = DatosOportunidadEntrada;

/**
 * Edit the data of one oportunidad (name, responsable, origen, service,
 * amount). Stage, medium, motivo and follow-up state are untouched: they have
 * their own use cases. Validation runs first: a rejected input stores
 * nothing; an unknown id surfaces as OportunidadNotFoundError.
 */
export class EditarOportunidadUseCase {
  constructor(private readonly repo: ICrmOportunidadRepository) {}

  async execute(idOportunidad: string, datos: EditarOportunidadDatos): Promise<Oportunidad> {
    const validos = validarDatosOportunidad(datos);
    return this.repo.updateDatos(idOportunidad, validos);
  }
}
