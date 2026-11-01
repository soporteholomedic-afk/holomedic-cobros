import type { ICrmEmpresaRepository } from '../domain/ports';
import { UMBRAL_INTENTOS, type Empresa } from '../domain/entities';
import { DatosEmpresaInvalidosError, EmpresaNotFoundError } from '../domain/errors';
import { seguimientoDe } from './seguimiento';

export type AccionSugerencia = 'perder' | 'seguir';

/** Whether the "N intentos sin respuesta" suggestion is showing for this empresa (L8). */
export function sugerenciaVisible(e: Pick<Empresa, 'etapa' | 'intentosSinRespuesta' | 'sugerenciaDescartadaEn'>): boolean {
  return (
    e.intentosSinRespuesta >= UMBRAL_INTENTOS &&
    e.etapa !== 'cliente' &&
    e.etapa !== 'perdido' &&
    e.intentosSinRespuesta !== e.sugerenciaDescartadaEn
  );
}

/**
 * Answer the 3-attempts suggestion. The system only suggests; this runs when
 * the user presses a button.
 * - `perder` ("Pasar a Perdido"): Perdido with motivo no_contestan; clears the next action and the pending reply.
 * - `seguir` ("Seguir intentando"): stores the current attempt count, so the suggestion
 *   comes back after one more failed attempt.
 * Neither writes a history entry. Only valid while the suggestion shows.
 */
export class ResolverSugerenciaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(idEmpresa: string, accion: string): Promise<Empresa> {
    if (accion !== 'perder' && accion !== 'seguir') {
      throw new DatosEmpresaInvalidosError('Elige qué hacer con la sugerencia.');
    }
    const actual = await this.repo.getById(idEmpresa);
    if (!actual) throw new EmpresaNotFoundError(idEmpresa);
    if (!sugerenciaVisible(actual)) {
      throw new DatosEmpresaInvalidosError('La sugerencia ya no corresponde a esta tarjeta.');
    }
    const base = seguimientoDe(actual);
    if (accion === 'seguir') {
      return this.repo.updateSeguimiento(
        idEmpresa,
        { ...base, sugerenciaDescartadaEn: actual.intentosSinRespuesta },
        null,
      );
    }
    return this.repo.updateSeguimiento(
      idEmpresa,
      {
        ...base,
        etapa: 'perdido',
        motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
        proximaAccion: null,
        faltaResponderDesde: null,
      },
      null,
    );
  }
}
