import { NotFoundError } from '../domain/errors';
import type { ConversacionCrm, MensajeCrm } from '../domain/entities';
import type { ConversacionCrmRepository, MensajeCrmRepository } from '../domain/ports';

/**
 * ObtainHiloConversacionUseCase (agente-ia-crm E1) — the bandeja hilo
 * read: the conversation + its thread (oldest-first for delivery) and
 * the read-marking side effect (noLeidos = 0 once the operator SAW
 * the thread — the same write the bandeja depends on for badges).
 * A missing conversation is the typed CONVERSACION_NO_ENCONTRADA
 * error (route → 404).
 */

/** Página de hilo por defecto (los OUT recientes casi nunca superan esto). */
const LIMITE_HILO = 50;

/** Typed 404 for every bandeja use case that must re-read the row. */
export class ConversacionNoEncontradaError extends NotFoundError {
  constructor() {
    super('Conversación no encontrada');
    this.name = 'ConversacionNoEncontradaError';
  }
}

export interface HiloConversacion {
  conversacion: ConversacionCrm;
  /** Oldest-first (delivery order) — the port pages newest-first. */
  mensajes: MensajeCrm[];
}

export interface ObtenerHiloConversacionDeps {
  conversaciones: ConversacionCrmRepository;
  mensajes: MensajeCrmRepository;
}

export class ObtenerHiloConversacionUseCase {
  constructor(private readonly deps: ObtenerHiloConversacionDeps) {}

  async ejecutar(conversacionId: number): Promise<HiloConversacion> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    const pagina = await this.deps.mensajes.listarPorConversacion(conversacionId, {
      limite: LIMITE_HILO,
    });
    const mensajes = [...pagina].reverse();

    // Entregar el hilo YA lo marca leído (E1: abrir la conversación
    // consume el badge; no existe lectura sin abrir el hilo).
    await this.deps.conversaciones.marcarMensajesLeidos(conversacionId);

    return { conversacion, mensajes };
  }
}
