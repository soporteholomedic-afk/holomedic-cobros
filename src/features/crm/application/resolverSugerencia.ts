import { UMBRAL_INTENTOS, ETAPAS_CERRADAS, type Oportunidad } from '../domain/entities';
import { DatosEmpresaInvalidosError, OportunidadNotFoundError } from '../domain/errors';
import type { ICrmOportunidadRepository } from '../domain/ports';
import { seguimientoDe } from './seguimiento';

export type AccionSugerencia = 'perder' | 'seguir';

/** Whether the "N intentos sin respuesta" suggestion is showing for this deal (L8). */
export function sugerenciaVisible(o: Pick<Oportunidad, 'etapa' | 'intentosSinRespuesta' | 'sugerenciaDescartadaEn'>): boolean {
  return (
    o.intentosSinRespuesta >= UMBRAL_INTENTOS &&
    !ETAPAS_CERRADAS.includes(o.etapa) &&
    o.intentosSinRespuesta !== o.sugerenciaDescartadaEn
  );
}

/**
 * Answer the 3-attempts suggestion of ONE oportunidad. The system only
 * suggests; this runs when the user presses a button.
 * - `perder` ("Pasar a Perdida"): Perdida with motivo no_contestan; clears the
 *   next action and the pending reply. The empresa and its other
 *   oportunidades are untouched (S5.1/S6.2).
 * - `seguir` ("Seguir intentando"): stores the current attempt count, so the
 *   suggestion comes back after one more failed attempt.
 * Neither writes a history entry. Only valid while the suggestion shows.
 */
export class ResolverSugerenciaUseCase {
  constructor(private readonly repo: ICrmOportunidadRepository) {}

  async execute(idOportunidad: string, accion: string): Promise<Oportunidad> {
    if (accion !== 'perder' && accion !== 'seguir') {
      throw new DatosEmpresaInvalidosError('Elige qué hacer con la sugerencia.');
    }
    const actual = await this.repo.getById(idOportunidad);
    if (!actual) throw new OportunidadNotFoundError(idOportunidad);
    if (!sugerenciaVisible(actual)) {
      throw new DatosEmpresaInvalidosError('La sugerencia ya no corresponde a esta tarjeta.');
    }
    const base = seguimientoDe(actual);
    if (accion === 'seguir') {
      return this.repo.updateSeguimiento(
        idOportunidad,
        { ...base, sugerenciaDescartadaEn: actual.intentosSinRespuesta },
        null,
      );
    }
    return this.repo.updateSeguimiento(
      idOportunidad,
      {
        ...base,
        etapa: 'perdida',
        motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
        proximaAccion: null,
        faltaResponderDesde: null,
      },
      null,
    );
  }
}
