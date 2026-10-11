import type { ConversacionCrm } from '../domain/entities';
import type {
  ConversacionCrmRepository,
  MensajeCrmRepository,
  TareaAgenteRepository,
} from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';
import { EstadoConversacionInvalidoError } from './tomarConversacion';

// Re-export: the E3·T3 lifecycle use cases share the bandeja typed
// 404 and the invalid-state 409 (vincularConversacion precedent).
export { ConversacionNoEncontradaError, EstadoConversacionInvalidoError };

/**
 * DevolverConversacionUseCase (agente-ia-crm E3·T3) — the operator
 * hands the conversation BACK to la Guía: only from TOMADA_HUMANO →
 * ACTIVA_IA + asignadaA NULL + modo 'IA'. The RE-ENCOLA decision
 * rides along: if the last IN message has NO later OUT message
 * (mensajes.listarPorConversacion, newest-first window) ONE
 * idempotent GENERAR_RESPUESTA task is created for it — the
 * unanswered client message must not wait for the next inbound
 * (vincularConversacion E2·T5 hook mirror). An already-answered IN
 * requeues nothing: la Guía never repeats an answer someone else
 * already sent.
 */

/** Thread window for the re-encola decision (hilo precedent: 50). */
const LIMITE_VENTANA_HILO = 50;

export interface ResultadoDevolverConversacion {
  estado: 'ACTIVA_IA';
  /** true when a GENERAR_RESPUESTA task was (idempotently) created. */
  reencolada: boolean;
}

export interface DevolverConversacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'actualizarEstado' | 'actualizarAsignacion'
  >;
  /**
   * Thread read + task queue for the re-encola hook. Optional
   * (vincularConversacion precedent): the SQL container always
   * provides both; without them the devolución still happens and
   * simply reports reencolada false.
   */
  mensajes?: Pick<MensajeCrmRepository, 'listarPorConversacion'>;
  tareas?: Pick<TareaAgenteRepository, 'crearSiNoExiste'>;
}

export class DevolverConversacionUseCase {
  constructor(private readonly deps: DevolverConversacionDeps) {}

  async ejecutar(entrada: { conversacionId: number }): Promise<ResultadoDevolverConversacion> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    if (conversacion.estado !== 'TOMADA_HUMANO') {
      throw new EstadoConversacionInvalidoError(conversacion.estado, 'devolver la conversación');
    }

    // Dos escrituras de la MISMA fila: estado primero, luego la
    // asignación (null) + modo ('IA') juntos.
    const activada = await this.deps.conversaciones.actualizarEstado(
      entrada.conversacionId,
      'ACTIVA_IA',
    );
    if (activada === null) throw new ConversacionNoEncontradaError();

    const actualizarAsignacion = this.deps.conversaciones.actualizarAsignacion;
    if (actualizarAsignacion === undefined) {
      throw new Error(
        'devolverConversacion requiere un repositorio con actualizarAsignacion (capacidad E3)',
      );
    }
    await actualizarAsignacion.call(this.deps.conversaciones, entrada.conversacionId, null, 'IA');

    const reencolada = await this.reencolarSiPendiente(entrada.conversacionId);
    return { estado: 'ACTIVA_IA', reencolada };
  }

  /**
   * The re-encola decision over the newest-first window: find the
   * most recent IN message; requeue ONE GENERAR_RESPUESTA task for it
   * only when NO OUT message with a higher id exists (someone — la
   * Guía or the operator — already answered it).
   */
  private async reencolarSiPendiente(conversacionId: number): Promise<boolean> {
    if (this.deps.mensajes === undefined || this.deps.tareas === undefined) return false;

    const ventana = await this.deps.mensajes.listarPorConversacion(conversacionId, {
      limite: LIMITE_VENTANA_HILO,
    });
    const ultimoIn = ventana.find((mensaje) => mensaje.direccion === 'IN');
    if (ultimoIn === undefined) return false;

    const respondido = ventana.some(
      (mensaje) => mensaje.direccion === 'OUT' && mensaje.id > ultimoIn.id,
    );
    if (respondido) return false;

    const tarea = await this.deps.tareas.crearSiNoExiste({
      conversacionId,
      mensajeId: ultimoIn.id,
      tipo: 'GENERAR_RESPUESTA',
    });
    return tarea.creada;
  }
}
