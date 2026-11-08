import type { MotivoDatos, Oportunidad } from '../domain/entities';
import { DatosEmpresaInvalidosError, OportunidadNotFoundError } from '../domain/errors';
import type { ICrmOportunidadRepository } from '../domain/ports';
import { seguimientoDe } from './seguimiento';
import { validarMedio, validarMotivo } from './validar';

export interface CambioSeguimiento {
  medio?: string | null;
  motivo?: MotivoDatos | null;
}

/** Edit the medium and/or the loss reason of ONE oportunidad without moving it. */
export class ActualizarSeguimientoOportunidadUseCase {
  constructor(private readonly repo: ICrmOportunidadRepository) {}

  async execute(idOportunidad: string, cambio: CambioSeguimiento): Promise<Oportunidad> {
    const tocaMedio = cambio.medio !== undefined;
    const tocaMotivo = cambio.motivo !== undefined;
    if (!tocaMedio && !tocaMotivo) {
      throw new DatosEmpresaInvalidosError('No hay nada que actualizar');
    }
    const actual = await this.repo.getById(idOportunidad);
    if (!actual) throw new OportunidadNotFoundError(idOportunidad);

    let medio = actual.medio;
    let motivo = actual.motivo;
    if (tocaMedio) {
      if (actual.etapa === 'por_contactar') {
        throw new DatosEmpresaInvalidosError('Primero pasa la oportunidad a Contactado');
      }
      medio = validarMedio(cambio.medio);
    }
    if (tocaMotivo) {
      if (actual.etapa !== 'perdida') {
        throw new DatosEmpresaInvalidosError('Solo una oportunidad en Perdida tiene motivo');
      }
      motivo = validarMotivo(cambio.motivo);
    }
    return this.repo.updateSeguimiento(
      idOportunidad,
      { ...seguimientoDe(actual), medio, medioOtro: medio === 'otro' ? actual.medioOtro : null, motivo },
      null,
    );
  }
}
