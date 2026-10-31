import type { ICrmEmpresaRepository } from '../domain/ports';
import type { Empresa, MotivoDatos } from '../domain/entities';
import { DatosEmpresaInvalidosError, EmpresaNotFoundError } from '../domain/errors';
import { validarMedio, validarMotivo } from './validar';

export interface CambioSeguimiento {
  medio?: string | null;
  motivo?: MotivoDatos | null;
}

/** Edit the medium and/or the loss reason without moving the empresa. */
export class ActualizarSeguimientoUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(id: string, cambio: CambioSeguimiento): Promise<Empresa> {
    const tocaMedio = cambio.medio !== undefined;
    const tocaMotivo = cambio.motivo !== undefined;
    if (!tocaMedio && !tocaMotivo) {
      throw new DatosEmpresaInvalidosError('No hay nada que actualizar');
    }
    const actual = await this.repo.getById(id);
    if (!actual) throw new EmpresaNotFoundError(id);

    let medio = actual.medio;
    let motivo = actual.motivo;
    if (tocaMedio) {
      if (actual.etapa === 'por_contactar') {
        throw new DatosEmpresaInvalidosError('Primero pasa la empresa a Contactado');
      }
      medio = validarMedio(cambio.medio);
    }
    if (tocaMotivo) {
      if (actual.etapa !== 'perdido') {
        throw new DatosEmpresaInvalidosError('Solo una empresa en Perdido tiene motivo');
      }
      motivo = validarMotivo(cambio.motivo);
    }
    return this.repo.updateEstado(id, { etapa: actual.etapa, medio, motivo });
  }
}
