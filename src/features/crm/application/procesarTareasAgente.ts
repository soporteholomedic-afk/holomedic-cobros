import type { TareaAgente } from '../domain/entities';
import type { ConversacionCrmRepository, TareaAgenteRepository } from '../domain/ports';

import type { ResultadoProcesarIngesta } from './conocimiento/procesarIngestaConocimiento';
import type { OpcionesEjecutarMotor, ResultadoAgente } from './generarRespuestaAgente';

/**
 * ProcesarTareasAgenteUseCase (agente-ia-crm E2·T5) — drain the
 * durable CRM_AgenteTareas queue: claim a batch (fresh PENDIENTE rows
 * plus PROCESANDO rows abandoned by a crashed run), run the E2 motor
 * once per task and translate each motor outcome into a queue
 * transition. The webhook/simulator routes enqueue tasks (fast DB
 * write awaited before the ack) and trigger this drain
 * fire-and-forget; the lazy sweeper (iniciarBarredorTareas) drains on
 * an interval as the backstop. NEVER awaited inside a request handler
 * body — the slow LLM work lives here, not in the ack path.
 *
 * Outcome mapping (locked with the motor contract, E2·T4):
 * - RESPONDIDO | ESCALADO | CONVERSACION_NO_ACTIVA_IA → completar.
 *   The task is dead: answered, escalated, or a human already took
 *   the conversation — re-running would double-send.
 * - FUERA_DE_HORARIO | AGENTE_DESHABILITADO → reencolar (NO attempt
 *   counted — these are not failures; the row waits behind the 60 s
 *   claim cooling until the window opens or the switch flips).
 * - FALLIDO_ENVIO | motor throw → fallar (attempt counted): at 3
 *   attempts the row goes FALLIDA (terminal), else back to PENDIENTE
 *   for a cooled retry. A send failure keeps ACTIVA_IA (motor
 *   contract), so the retry re-attempts the SAME answer.
 *
 * A motor throw is caught PER TASK: one failing task never stops the
 * batch. The result reports the OBSERVED derivation (intentos + 1 >=
 * 3 → 'FALLIDA') rather than re-reading the row — fallar's semantics
 * decide, this only mirrors them.
 *
 * E3·T2 — the RESPONDER_CON_INDICACION route: the worker re-reads the
 * conversation's latest RESUELTA solicitud (the indicación's source
 * of truth) and hands it to the motor as opciones.indicacionHumana;
 * the outcome mapping is IDENTICAL to GENERAR_RESPUESTA (a
 * FUERA_DE_HORARIO indicación waits for the window like any other).
 * A missing resolved solicitud (or one resolved without indicación)
 * is a data inconsistency that shouldn't happen — the task FAILS
 * (attempt counted) instead of answering blind.
 *
 * E4·T7 — the INGESTAR_CONOCIMIENTO route: the worker hands the task
 * to the ingestion processor (procesarIngestaConocimiento) keyed by
 * tarea.mensajeId = the INGESTA id (conversacionId is NULL on these
 * tasks — there is no conversation). The processor NEVER throws for
 * content failures (a corrupt PDF is swallowed into marcarFallida and
 * stays auditable), so a returned run COMPLETES the task and reports
 * 'INGESTADA' — a corrupt ingesta must not burn its 3 queue retries.
 * A processor THROW (infrastructure: e.g. marcarFallida itself failed,
 * or the dep is missing) counts an attempt like any motor throw. A
 * GENERAR/RESPONDER task carrying conversacionId NULL is a data
 * inconsistency: it FAILS loudly instead of answering a conversation
 * that does not exist.
 */

/** Every per-task outcome of one drain run. */
export type ResultadoTareaProcesada = ResultadoAgente['resultado'] | 'REENCOLADA' | 'FALLIDA' | 'INGESTADA';

export interface ResultadoProcesarTareas {
  /** Tasks claimed and attempted in this run. */
  procesadas: number;
  resultados: Array<{ tareaId: number; resultado: ResultadoTareaProcesada }>;
}

/**
 * The AI engine the queue drains into — the
 * GenerarRespuestaAgenteUseCase shape (structural, so tests fake it
 * without the class).
 */
export interface MotorAgentePort {
  ejecutar(
    conversacionId: number,
    ahora?: Date,
    opciones?: OpcionesEjecutarMotor,
  ): Promise<ResultadoAgente>;
}

export interface ProcesarTareasAgenteDeps {
  tareas: TareaAgenteRepository;
  motor: MotorAgentePort;
  /**
   * E3·T2: the resolved-solicitud read behind the
   * RESPONDER_CON_INDICACION route (structural minimum — MotorAgentePort
   * precedent). OPTIONAL so pre-E3 constructions stay valid; without
   * it those tasks FAIL (data inconsistency) instead of answering
   * blind. The composition root should always provide it.
   */
  conversaciones?: Pick<ConversacionCrmRepository, 'obtenerUltimaSolicitudResuelta'>;
  /**
   * E4·T7: the ingestion processor behind the INGESTAR_CONOCIMIENTO
   * route (structural minimum — conversaciones precedent). OPTIONAL so
   * pre-E4 constructions stay valid; without it those tasks FAIL
   * (attempt counted) instead of being silently dropped. The
   * composition root should always provide it.
   */
  procesarIngesta?: {
    ejecutar(entrada: { ingestaId: number }): Promise<ResultadoProcesarIngesta>;
  };
}

/** Crash recovery: a PROCESANDO claim older than this is abandoned. */
const MINUTOS_ABANDONO = 5;

/**
 * Typed data-inconsistency failure of the RESPONDER_CON_INDICACION
 * route (E3·T2): the resolved solicitud — or its indicación — is not
 * there. Shouldn't happen (aplicarIndicacion writes both); the task
 * FAILS with this message instead of the motor answering blind.
 */
export class SolicitudIndicacionAusenteError extends Error {
  constructor(motivo: string) {
    super(`Solicitud de ayuda resuelta ausente: ${motivo}`);
    this.name = 'SolicitudIndicacionAusenteError';
  }
}

/**
 * Typed data-inconsistency failure of the GENERAR/RESPONDER routes
 * (E4·T7): the task claims to answer a conversation but carries
 * conversacionId NULL (only INGESTAR_CONOCIMIENTO tasks are NULL).
 * The task FAILS instead of the motor answering a conversation that
 * does not exist.
 */
export class ConversacionAusenteError extends Error {
  constructor(motivo: string) {
    super(`Conversación ausente en la tarea: ${motivo}`);
    this.name = 'ConversacionAusenteError';
  }
}

/**
 * Typed missing-dependency failure of the INGESTAR_CONOCIMIENTO route
 * (E4·T7, SolicitudIndicacionAusenteError precedent): the queue holds
 * ingestion tasks but no processor was wired. The task FAILS (attempt
 * counted) instead of being dropped.
 */
export class ProcesadorIngestaAusenteError extends Error {
  constructor(motivo: string) {
    super(`Procesador de ingestas ausente: ${motivo}`);
    this.name = 'ProcesadorIngestaAusenteError';
  }
}

export class ProcesarTareasAgenteUseCase {
  constructor(private readonly deps: ProcesarTareasAgenteDeps) {}

  async ejecutar(limite = 10): Promise<ResultadoProcesarTareas> {
    const pendientes = await this.deps.tareas.reclamarPendientes(limite);
    // Crash recovery: PROCESANDO rows claimed long ago belong to a
    // dead run — reclaim them (deduped against the fresh claims; a
    // row both claims can see is processed exactly once).
    const abandonadas = await this.deps.tareas.reclamarAbandonadas(limite, MINUTOS_ABANDONO);
    const vistas = new Set<number>();
    const reclamadas = [...pendientes, ...abandonadas].filter((tarea) => {
      if (vistas.has(tarea.id)) return false;
      vistas.add(tarea.id);
      return true;
    });

    const resultados: ResultadoProcesarTareas['resultados'] = [];
    for (const tarea of reclamadas) {
      resultados.push(await this.procesarUna(tarea));
    }
    return { procesadas: resultados.length, resultados };
  }

  private async procesarUna(tarea: TareaAgente): Promise<{
    tareaId: number;
    resultado: ResultadoTareaProcesada;
  }> {
    try {
      let resultado: ResultadoAgente;
      if (tarea.tipo === 'INGESTAR_CONOCIMIENTO') {
        await this.ejecutarProcesarIngesta(tarea);
        // El procesador traga los fallos de contenido en marcarFallida
        // (un PDF corrupto no mejora con reintentos): una ejecución que
        // RETURNÓ terminó el trabajo → la tarea se COMPLETA.
        await this.deps.tareas.completar(tarea.id);
        return { tareaId: tarea.id, resultado: 'INGESTADA' };
      }
      // Las rutas conversacionales exigen conversación (NULL solo en
      // tareas de ingesta) — inconsistencia de datos revienta acá.
      if (tarea.conversacionId === null) {
        throw new ConversacionAusenteError(
          `la tarea ${tarea.tipo} ${tarea.id} no tiene conversación (conversacionId NULL)`,
        );
      }
      if (tarea.tipo === 'RESPONDER_CON_INDICACION') {
        resultado = await this.ejecutarRespuestaConIndicacion(tarea, tarea.conversacionId);
      } else {
        resultado = await this.deps.motor.ejecutar(tarea.conversacionId);
      }
      if (resultado.resultado === 'FUERA_DE_HORARIO' || resultado.resultado === 'AGENTE_DESHABILITADO') {
        // Not a failure: no attempt counted, the row waits cooled.
        await this.deps.tareas.reencolar(tarea.id);
        return { tareaId: tarea.id, resultado: 'REENCOLADA' };
      }
      if (resultado.resultado === 'FALLIDO_ENVIO') {
        return this.registrarFallo(tarea, 'FALLIDO_ENVIO');
      }
      // RESPONDIDO | ESCALADO | CONVERSACION_NO_ACTIVA_IA: done, dead.
      await this.deps.tareas.completar(tarea.id);
      return { tareaId: tarea.id, resultado: resultado.resultado };
    } catch (error) {
      // Motor threw (or the state write itself failed): count the
      // attempt and keep draining — a row whose fallar ALSO fails
      // stays PROCESANDO and is recovered by reclamarAbandonadas.
      return this.registrarFallo(tarea, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * E4·T7 route: hand the task to the ingestion processor keyed by
   * mensajeId = the ingesta id. Throws ONLY on missing dep (wiring) or
   * processor infrastructure failure — content failures never escape
   * procesarIngestaConocimiento (its contract), so they complete the
   * task instead of burning retries.
   */
  private async ejecutarProcesarIngesta(tarea: TareaAgente): Promise<void> {
    const procesarIngesta = this.deps.procesarIngesta;
    if (procesarIngesta === undefined) {
      throw new ProcesadorIngestaAusenteError(
        `procesarIngesta ausente (capacidad E4): la tarea INGESTAR_CONOCIMIENTO ${tarea.id} no tiene procesador cableado`,
      );
    }
    await procesarIngesta.ejecutar({ ingestaId: tarea.mensajeId });
  }

  /**
   * E3·T2 route: re-read the conversation's latest RESUELTA solicitud
   * (the indicación's source of truth — no extra task fields) and run
   * the motor with it. A missing read capability, a missing row or a
   * blank indicación throws SolicitudIndicacionAusenteError → the task
   * falls (attempt counted), never answers blind.
   */
  private async ejecutarRespuestaConIndicacion(tarea: TareaAgente, conversacionId: number): Promise<ResultadoAgente> {
    const repo = this.deps.conversaciones;
    const obtenerResuelta = repo?.obtenerUltimaSolicitudResuelta;
    if (repo === undefined || obtenerResuelta === undefined) {
      throw new SolicitudIndicacionAusenteError(
        `repositorio sin la capacidad obtenerUltimaSolicitudResuelta (conversación ${conversacionId})`,
      );
    }
    // .call(repo, …): the optional method is read off the port, so it
    // must run bound to it (a detached `this` would read its state off
    // undefined).
    const solicitud = await obtenerResuelta.call(repo, conversacionId);
    if (solicitud === null) {
      throw new SolicitudIndicacionAusenteError(
        `sin solicitud RESUELTA para la conversación ${conversacionId}`,
      );
    }
    const indicacion = solicitud.indicacion?.trim() ?? '';
    if (indicacion === '') {
      throw new SolicitudIndicacionAusenteError(
        `la solicitud ${solicitud.id} quedó resuelta sin indicación`,
      );
    }
    return this.deps.motor.ejecutar(conversacionId, new Date(), {
      indicacionHumana: indicacion,
    });
  }

  private async registrarFallo(tarea: TareaAgente, error: string): Promise<{
    tareaId: number;
    resultado: ResultadoTareaProcesada;
  }> {
    try {
      await this.deps.tareas.fallar(tarea.id, error);
    } catch (errorFallar) {
      console.error('[procesarTareasAgente] registrar fallo de tarea falló', {
        tareaId: tarea.id,
        error: errorFallar instanceof Error ? errorFallar.message : String(errorFallar),
      });
    }
    // Mirror fallar's derivation: this attempt makes intentos + 1; the
    // 3rd attempt is terminal (the adapter flips the row to FALLIDA).
    return {
      tareaId: tarea.id,
      resultado: tarea.intentos + 1 >= 3 ? 'FALLIDA' : 'REENCOLADA',
    };
  }
}
