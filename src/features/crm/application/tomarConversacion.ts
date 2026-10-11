import { ConflictError } from '../domain/errors';
import type { ConversacionCrm } from '../domain/entities';
import type { ConversacionCrmRepository } from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the E3·T3 lifecycle use cases (devolver, escalar) share
// ONE typed invalid-state error (vincularConversacion re-export
// precedent for shared typed errors).
export { ConversacionNoEncontradaError };

/**
 * TomarConversacionUseCase (agente-ia-crm E3·T3) — the operator takes
 * over a conversation la Guía was managing: ACTIVA_IA |
 * REQUIERE_HUMANO → TOMADA_HUMANO with `asignadaA` set to the
 * operator's LOGIN NAME — the currency the empresas asignar precedent
 * stores (dbo.usuarios.usuario resolved route-side from the opaque
 * sub, never the sub itself) — and modo 'HUMANO' in ONE
 * actualizarAsignacion write (estado moves via actualizarEstado:
 * two same-row writes, no cross-table transaction needed).
 *
 * Typed errors: already TOMADA_HUMANO → ConversacionYaTomadaError
 * (409); any other estado → EstadoConversacionInvalidoError (409);
 * missing row → ConversacionNoEncontradaError (404). A repo without
 * the E3 actualizarAsignacion capability fails loudly instead of
 * taking half-way (aplicarIndicacion precedent).
 */

/** Typed 409 when another operator already took the conversation. */
export class ConversacionYaTomadaError extends ConflictError {
  constructor() {
    super('La conversación ya está tomada por un operador');
    this.name = 'ConversacionYaTomadaError';
  }
}

/**
 * Typed 409 when the conversation's estado does not admit the
 * lifecycle action (route → CONFLICT_ERROR). Shared by tomar,
 * devolver and escalar.
 */
export class EstadoConversacionInvalidoError extends ConflictError {
  constructor(estado: ConversacionCrm['estado'], accion: string) {
    super(`La conversación está en estado ${estado}; no se puede ${accion}`);
    this.name = 'EstadoConversacionInvalidoError';
  }
}

export interface TomarConversacionEntrada {
  conversacionId: number;
  /**
   * The acting operator: `id` is the LOGIN NAME (the asignadaA
   * currency — empresas asignar precedent) and `nombre` the display
   * name; both resolved route-side via getUsuarioDb().getById(sub).
   */
  usuario: { id: string; nombre: string };
}

export interface ResultadoTomarConversacion {
  estado: 'TOMADA_HUMANO';
  asignadaA: string;
}

export interface TomarConversacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'actualizarEstado' | 'actualizarAsignacion'
  >;
}

export class TomarConversacionUseCase {
  constructor(private readonly deps: TomarConversacionDeps) {}

  async ejecutar(entrada: TomarConversacionEntrada): Promise<ResultadoTomarConversacion> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    if (conversacion.estado === 'TOMADA_HUMANO') {
      throw new ConversacionYaTomadaError();
    }
    if (conversacion.estado !== 'ACTIVA_IA' && conversacion.estado !== 'REQUIERE_HUMANO') {
      throw new EstadoConversacionInvalidoError(conversacion.estado, 'tomar la conversación');
    }

    // Dos escrituras de la MISMA fila: primero el estado (la toma es
    // visible aunque la asignación falle), luego asignadaA+modo juntos.
    const tomada = await this.deps.conversaciones.actualizarEstado(
      entrada.conversacionId,
      'TOMADA_HUMANO',
    );
    if (tomada === null) throw new ConversacionNoEncontradaError();

    const actualizarAsignacion = this.deps.conversaciones.actualizarAsignacion;
    if (actualizarAsignacion === undefined) {
      throw new Error('tomarConversacion requiere un repositorio con actualizarAsignacion (capacidad E3)');
    }
    await actualizarAsignacion.call(this.deps.conversaciones, entrada.conversacionId, entrada.usuario.id, 'HUMANO');

    return { estado: 'TOMADA_HUMANO', asignadaA: entrada.usuario.id };
  }
}
