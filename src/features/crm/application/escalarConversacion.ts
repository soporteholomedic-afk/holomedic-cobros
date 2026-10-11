import { ValidationError } from '../domain/errors';
import type { ConversacionCrmRepository } from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';
import { EstadoConversacionInvalidoError } from './tomarConversacion';

// Re-export: the E3·T3 lifecycle use cases share the bandeja typed
// 404 and the invalid-state 409 (vincularConversacion precedent).
export { ConversacionNoEncontradaError, EstadoConversacionInvalidoError };

/**
 * EscalarConversacionUseCase (agente-ia-crm E3·T3) — reassign a taken
 * conversation to ANOTHER operator: only from TOMADA_HUMANO and it
 * STAYS TOMADA_HUMANO — a pure owner swap through actualizarAsignacion
 * (asignadaA = target, modo 'HUMANO'); no estado write at all. The
 * target's assignability (permiso crm_conversaciones) is validated
 * ROUTE-side over the auth usuarios source (empresas asignar
 * precedent: identity checks live route-side — this use case stays
 * pure over repos); here only shape + estado are guarded.
 */

export interface EscalarConversacionEntrada {
  conversacionId: number;
  /** Target operator's LOGIN NAME (the asignadaA currency). */
  usuarioId: string;
}

export interface ResultadoEscalarConversacion {
  estado: 'TOMADA_HUMANO';
  asignadaA: string;
}

export interface EscalarConversacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'actualizarAsignacion'
  >;
}

export class EscalarConversacionUseCase {
  constructor(private readonly deps: EscalarConversacionDeps) {}

  async ejecutar(entrada: EscalarConversacionEntrada): Promise<ResultadoEscalarConversacion> {
    const usuarioId = entrada.usuarioId.trim();
    if (usuarioId === '') {
      throw new ValidationError('El usuario destino es obligatorio para escalar la conversación');
    }

    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    if (conversacion.estado !== 'TOMADA_HUMANO') {
      throw new EstadoConversacionInvalidoError(conversacion.estado, 'escalar la conversación');
    }

    const actualizarAsignacion = this.deps.conversaciones.actualizarAsignacion;
    if (actualizarAsignacion === undefined) {
      throw new Error(
        'escalarConversacion requiere un repositorio con actualizarAsignacion (capacidad E3)',
      );
    }
    await actualizarAsignacion.call(this.deps.conversaciones, entrada.conversacionId, usuarioId, 'HUMANO');

    return { estado: 'TOMADA_HUMANO', asignadaA: usuarioId };
  }
}
