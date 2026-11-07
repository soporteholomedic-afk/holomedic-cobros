import { ETAPAS_OPORTUNIDAD, type EtapaOportunidad, type MotivoDatos, type Oportunidad } from '../domain/entities';
import { DatosEmpresaInvalidosError, EtapaInvalidaError, OportunidadNotFoundError } from '../domain/errors';
import type { ICrmOportunidadRepository } from '../domain/ports';
import { seguimientoDe } from './seguimiento';
import { validarMedio, validarMotivo } from './validar';

export interface MoverExtras {
  medio?: string | null;
  motivo?: MotivoDatos | null;
}

/**
 * Move ONE oportunidad to another stage — the board card is the deal, never
 * the empresa (S2/S4). Losing or winning a deal touches neither the empresa
 * relacion nor its sibling oportunidades (S5.1/S6.2, S7.3/S7.6). Stage and
 * reason stay coherent:
 * - Perdida needs a valid reason; any other stage clears it.
 * - Por contactar clears the medium.
 * - Contactado needs a medium (the one sent, or the one already stored).
 * - Other open stages keep the stored medium unless a new one is sent.
 * - Ganada and Perdida have no next action: moving there clears it.
 * The port has no plain stage write, so every move goes through
 * `updateSeguimiento` with the rest of the follow-up state preserved.
 * The medium sent here is one of llamada/correo/whatsapp: "otro" needs its
 * "¿Cuál?" and is picked in the activity flow. A stored "otro" is kept.
 */
export class MoverOportunidadUseCase {
  constructor(private readonly repo: ICrmOportunidadRepository) {}

  async execute(idOportunidad: string, etapa: string, extras: MoverExtras = {}): Promise<Oportunidad> {
    if (!(ETAPAS_OPORTUNIDAD as readonly string[]).includes(etapa)) throw new EtapaInvalidaError(etapa);
    const destino = etapa as EtapaOportunidad;
    const actual = await this.repo.getById(idOportunidad);
    if (!actual) throw new OportunidadNotFoundError(idOportunidad);

    const motivo = destino === 'perdida' ? validarMotivo(extras.motivo) : null;
    let medio = actual.medio;
    if (destino === 'por_contactar') {
      medio = null;
    } else if (extras.medio !== undefined && extras.medio !== null) {
      medio = validarMedio(extras.medio);
    }
    if (destino === 'contactado' && medio === null) {
      throw new DatosEmpresaInvalidosError('Elige cómo se contactó a la empresa');
    }
    const cierra = destino === 'ganada' || destino === 'perdida';
    return this.repo.updateSeguimiento(
      idOportunidad,
      {
        ...seguimientoDe(actual),
        etapa: destino,
        medio,
        medioOtro: medio === 'otro' ? actual.medioOtro : null,
        motivo,
        proximaAccion: cierra ? null : actual.proximaAccion,
      },
      null,
    );
  }
}
