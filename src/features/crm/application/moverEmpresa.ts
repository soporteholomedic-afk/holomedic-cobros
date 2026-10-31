import type { ICrmEmpresaRepository } from '../domain/ports';
import { ETAPAS, type Empresa, type Etapa, type MotivoDatos } from '../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  EtapaInvalidaError,
} from '../domain/errors';
import { validarMedio, validarMotivo } from './validar';

export interface MoverExtras {
  medio?: string | null;
  motivo?: MotivoDatos | null;
}

/**
 * Move an empresa to another board column, keeping medium and loss reason
 * coherent with the stage:
 * - Perdido needs a valid reason; any other stage clears it.
 * - Por contactar clears the medium.
 * - Contactado needs a medium (the one sent, or the one already stored).
 * - En seguimiento / Cliente keep the stored medium unless a new one is sent.
 */
export class MoverEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(id: string, etapa: string, extras: MoverExtras = {}): Promise<Empresa> {
    if (!(ETAPAS as readonly string[]).includes(etapa)) throw new EtapaInvalidaError(etapa);
    const destino = etapa as Etapa;
    const actual = await this.repo.getById(id);
    if (!actual) throw new EmpresaNotFoundError(id);

    const motivo = destino === 'perdido' ? validarMotivo(extras.motivo) : null;
    let medio = actual.medio;
    if (destino === 'por_contactar') {
      medio = null;
    } else if (extras.medio !== undefined && extras.medio !== null) {
      medio = validarMedio(extras.medio);
    }
    if (destino === 'contactado' && medio === null) {
      throw new DatosEmpresaInvalidosError('Elige cómo se contactó a la empresa');
    }
    return this.repo.updateEstado(id, { etapa: destino, medio, motivo });
  }
}
