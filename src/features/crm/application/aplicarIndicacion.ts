import type {
  ConversacionCrm,
  ResultadoAplicarIndicacion,
  SolicitudAyuda,
} from '../domain/entities';
import { NotFoundError, ValidationError } from '../domain/errors';
import type {
  ConocimientoCrmRepository,
  ConversacionCrmRepository,
  MemoriaConversacionPort,
  MensajeCrmRepository,
  TareaAgenteRepository,
} from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

/**
 * AplicarIndicacionUseCase (agente-ia-crm E3·T2) — the operator answers
 * a pending help request with an indicación: la Guía is told how to
 * proceed. Order of operations (memory best-effort FIRST, so its
 * failure can never lose the CORE writes that follow):
 *
 * 1. Load the conversation (typed 404 — ConversacionNoEncontradaError,
 *    bandeja precedent).
 * 2. obtenerSolicitudAyudaPendiente → typed 404 (AyudaNoPendienteError)
 *    when there is nothing to apply.
 * 3. Validate the indicación: trimmed, 1..2000 chars (typed 400 —
 *    IndicacionInvalidaError, ValidationError surface).
 * 4. Memory, BEST-EFFORT (try/catch + console.error): with an
 *    empresaId, guardar at 'chat' level with tipo 'indicacion_humana'
 *    and the deterministic operationId `indicacion-<solicitudId>`, then
 *    pinear — future answers of this thread honor the instruction.
 *    Failure → {guardada:false} and the flow CONTINUES: the durable
 *    source of truth of the indicación is the solicitud ROW, not the
 *    memory.
 * 5. crearHueco — CORE (same DB): the KB-gap candidate the E5 curator
 *    triages, seeded with the consulta and the exact términos the RAG
 *    prefilter searched. Failure throws (nothing resolved yet).
 * 6. resolverSolicitudAyuda — CORE: PENDIENTE → RESUELTA recording the
 *    indicación and resueltaPor (usuarioNombre || usuarioId).
 * 7. tareas.crearSiNoExiste — CORE: the idempotent
 *    RESPONDER_CON_INDICACION task (UNIQUE conversacionId+mensajeId+
 *    tipo) that relaunches la Guía; mensajeId from the solicitud, with
 *    the last IN/CLIENTE message as fallback when the row carries
 *    none.
 *
 * Deps are the structural minimum each port contributes (MotorAgentePort
 * precedent) — the SQL adapter satisfies them all; a repo without the
 * E3 capability fails loudly instead of answering blind.
 */

/** Operator instruction clamp (1..2000 — a WhatsApp-scale instruction). */
const INDICACION_MAX = 2000;
/** Thread page size for the tarea mensajeId fallback (hilo precedent: 50). */
const LIMITE_PAGINA_HILO = 50;

/** Typed 404 when the conversation has NO pending help request. */
export class AyudaNoPendienteError extends NotFoundError {
  constructor() {
    super('La conversación no tiene una solicitud de ayuda pendiente');
    this.name = 'AyudaNoPendienteError';
  }
}

/** Typed 400 when the indicación is blank or over the clamp. */
export class IndicacionInvalidaError extends ValidationError {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'IndicacionInvalidaError';
  }
}

export interface AplicarIndicacionEntrada {
  conversacionId: number;
  indicacion: string;
  /** Acting session user — the resueltaPor fallback. */
  usuarioId: string;
  /** Display name (preferred resueltaPor) when the session carries one. */
  usuarioNombre?: string;
}

export interface AplicarIndicacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'obtenerSolicitudAyudaPendiente' | 'resolverSolicitudAyuda'
  >;
  conocimiento: Pick<ConocimientoCrmRepository, 'crearHueco'>;
  memoria: MemoriaConversacionPort;
  tareas: Pick<TareaAgenteRepository, 'crearSiNoExiste'>;
  /** Thread read for the tarea mensajeId fallback (solicitud.mensajeId null). */
  mensajes?: Pick<MensajeCrmRepository, 'listarPorConversacion'>;
}

export class AplicarIndicacionUseCase {
  constructor(private readonly deps: AplicarIndicacionDeps) {}

  async ejecutar(entrada: AplicarIndicacionEntrada): Promise<ResultadoAplicarIndicacion> {
    // 1. La conversación debe existir (404 tipado del bandeja precedent).
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    // 2. Solo se aplica una solicitud PENDIENTE (la capacidad es
    //    opcional en el puerto: ausente ⇔ nada pendiente que aplicar).
    //    .call(repo, …): the optional method is read off the port, so it
    //    must run bound to it (a detached `this` would read its state
    //    off undefined).
    const repo = this.deps.conversaciones;
    const obtenerPendiente = repo.obtenerSolicitudAyudaPendiente;
    const solicitud =
      obtenerPendiente === undefined
        ? null
        : await obtenerPendiente.call(repo, entrada.conversacionId);
    if (solicitud === null) throw new AyudaNoPendienteError();

    // 3. Indicación válida: no vacía tras trim y dentro del clamp.
    const indicacion = entrada.indicacion.trim();
    if (indicacion === '') {
      throw new IndicacionInvalidaError('La indicación no puede estar vacía');
    }
    if (indicacion.length > INDICACION_MAX) {
      throw new IndicacionInvalidaError(
        `La indicación no puede superar ${INDICACION_MAX} caracteres`,
      );
    }

    // 4. Memoria (best-effort): la indicación como observación pineada
    //    del chat — enriquecimiento, nunca dependencia.
    const memoria = await this.guardarIndicacionEnMemoria(conversacion, solicitud, indicacion);

    // 5. Hueco de conocimiento (CORE): lo que la KB no pudo responder.
    //    .call(repo, …): the optional method is read off the port — run
    //    it bound (detached `this` would read state off undefined).
    const repoConocimiento = this.deps.conocimiento;
    const crearHueco = repoConocimiento.crearHueco;
    if (crearHueco === undefined) {
      throw new Error('aplicarIndicacion requiere un repositorio con crearHueco (capacidad E3)');
    }
    const hueco = await crearHueco.call(repoConocimiento, {
      consulta: solicitud.consulta,
      terminos: solicitud.terminosBuscados,
      origenSolicitudId: solicitud.id,
    });

    // 6. Resolver la solicitud (CORE): PENDIENTE → RESUELTA con la
    //    indicación y quién la dictó (nombre legible cuando lo hay).
    //    Same binding rule as crearHueco (optional port method).
    const resolver = repo.resolverSolicitudAyuda;
    if (resolver === undefined) {
      throw new Error(
        'aplicarIndicacion requiere un repositorio con resolverSolicitudAyuda (capacidad E3)',
      );
    }
    const resueltaPor =
      entrada.usuarioNombre !== undefined && entrada.usuarioNombre.trim() !== ''
        ? entrada.usuarioNombre.trim()
        : entrada.usuarioId;
    const resuelta = await resolver.call(repo, solicitud.id, indicacion, resueltaPor);

    // 7. Tarea idempotente (CORE): relanza la Guía con la indicación —
    //    el worker relee la indicación desde la fila resuelta.
    const mensajeId = await this.resolverMensajeId(solicitud);
    const tarea = await this.deps.tareas.crearSiNoExiste({
      conversacionId: entrada.conversacionId,
      mensajeId,
      tipo: 'RESPONDER_CON_INDICACION',
    });

    return { solicitud: resuelta, hueco, memoria, tarea };
  }

  /**
   * Best-effort memory write: 'chat'-level indicacion_humana with the
   * deterministic operationId (replaying the same resolución returns
   * the SAME observation id server-side), pinned so every future
   * answer of this thread loads it as context. No empresaId → nothing
   * to pin to. Failure only logs (codigo-level, no bodies) and the
   * flow continues — the solicitud row is the durable copy.
   */
  private async guardarIndicacionEnMemoria(
    conversacion: ConversacionCrm,
    solicitud: SolicitudAyuda,
    indicacion: string,
  ): Promise<{ guardada: boolean }> {
    if (conversacion.empresaId === null) return { guardada: false };
    try {
      const resultado = await this.deps.memoria.guardar({
        empresaId: conversacion.empresaId,
        conversacionId: conversacion.id,
        nivel: 'chat',
        tipo: 'indicacion_humana',
        titulo: 'Indicación humana',
        contenido: indicacion,
        operationId: `indicacion-${solicitud.id}`,
      });
      await this.deps.memoria.pinear(resultado.id);
      return { guardada: true };
    } catch (errorMemoria) {
      console.error('[aplicarIndicacion] guardar indicación en memoria falló', {
        conversacionId: conversacion.id,
        solicitudId: solicitud.id,
        error: errorMemoria instanceof Error ? errorMemoria.message : String(errorMemoria),
      });
      return { guardada: false };
    }
  }

  /**
   * The tarea's mensajeId: the solicitud's triggering message when the
   * row carries one, else the thread's last IN/CLIENTE message (the
   * message la Guía will answer). A solicitud with neither is a data
   * inconsistency — fail loudly instead of enqueueing a task that
   * cannot dedup against anything meaningful.
   */
  private async resolverMensajeId(solicitud: SolicitudAyuda): Promise<number> {
    if (solicitud.mensajeId !== null) return solicitud.mensajeId;
    if (this.deps.mensajes === undefined) {
      throw new Error(
        'aplicarIndicacion requiere el repositorio de mensajes para resolver el mensajeId de la tarea',
      );
    }
    const hilo = await this.deps.mensajes.listarPorConversacion(solicitud.conversacionId, {
      limite: LIMITE_PAGINA_HILO,
    });
    const disparador = hilo.find(
      (mensaje) => mensaje.direccion === 'IN' && mensaje.emisor === 'CLIENTE',
    );
    if (disparador === undefined) {
      throw new Error(
        `aplicarIndicacion: la solicitud ${solicitud.id} no tiene mensajeId ni mensaje IN que responder`,
      );
    }
    return disparador.id;
  }
}
