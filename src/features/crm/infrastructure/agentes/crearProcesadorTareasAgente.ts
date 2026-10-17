import { CerrarTratoAgenteUseCase } from '../../application/cerrarTratoAgente';
import { GenerarRespuestaAgenteUseCase } from '../../application/generarRespuestaAgente';
import { resolverConfigAgente } from '../../application/resolverConfigAgente';
import { ProcesarTareasAgenteUseCase } from '../../application/procesarTareasAgente';
import type { ResultadoProcesarTareas } from '../../application/procesarTareasAgente';
import { ProcesarIngestaConocimientoUseCase } from '../../application/conocimiento/procesarIngestaConocimiento';
import type { Clock } from '../../domain/ports';
import { getCrmDb } from '../getCrmDb';
import { crearMemoriaConversacionConfigurable } from '../engram/crearMemoriaConversacion';
import { crearGeneradorRespuesta } from '../llm/crearGeneradorRespuesta';
import { crearEnviadorWhatsappConfigurable } from '../whatsapp/crearEnviadorWhatsapp';

/**
 * Factory for the agent-task queue processor (agente-ia-crm E2·T5) —
 * a single trivial composition root. The wiring, end to end:
 *
 *   getCrmDb()  →  tareas (CRM_AgenteTareas)          the durable queue
 *              →  conversaciones + mensajes            thread + lifecycle
 *              →  conocimiento (CRM_Conocimiento)      the RAG prefilter
 *              →  empresas (CRM_Empresas)              E2·T9 identification match
 *   crearMemoriaConversacion()  →  memoria (Engram)    conversation memory
 *   crearGeneradorRespuesta()   →  generador (LLM)     answer + distillation
 *   crearEnviadorWhatsapp()     →  whatsapp (Kapso)    the outbound canal
 *
 * Those seven dependencies assemble the E2 motor
 * (GenerarRespuestaAgenteUseCase), and the motor plus the queue form
 * ProcesarTareasAgenteUseCase — the drain the sweeper
 * (iniciarBarredorTareas) and the route triggers call
 * fire-and-forget. The graph is rebuilt per call: getCrmDb() is a
 * cached singleton (pool + migrate run once per process) and the
 * factories are cheap, so a fresh use-case graph per drain keeps the
 * env-selected adapters current without any shared mutable state.
 *
 * Returns `{ procesar }` bound to the use case's ejecutar — callers
 * never await it inside a request handler body (the ack path stays as
 * fast as E1; the LLM work belongs to the background drain).
 */
export interface ProcesadorTareasAgente {
  procesar(limite?: number): Promise<ResultadoProcesarTareas>;
}

export function crearProcesadorTareasAgente(): ProcesadorTareasAgente {
  return {
    async procesar(limite?: number): Promise<ResultadoProcesarTareas> {
      const db = await getCrmDb();
      if (
        !db.conversaciones ||
        !db.mensajes ||
        !db.conocimiento ||
        !db.ingestaConocimiento ||
        !db.tareas
      ) {
        throw new Error(
          'CRM no configurado: faltan repositorios de conversaciones/mensajes/conocimiento/ingesta/tareas',
        );
      }
      // E5·T3: hot config — when the CRM_Config repo exists the engine
      // re-reads the DB overrides on every run (env stays the fallback).
      const configRepo = db.config;
      // E5·T10: the SAME enviador instance feeds the motor and the close
      // confirmation, so both honor one canal configuration per drain.
      const whatsapp = await crearEnviadorWhatsappConfigurable({ config: configRepo });
      const clock: Clock = () => new Date();
      const cerrarTrato = new CerrarTratoAgenteUseCase({
        conversaciones: db.conversaciones,
        mensajes: db.mensajes,
        empresas: db.empresas,
        pipelines: db.pipeline,
        whatsapp,
        clock,
      });
      const motor = new GenerarRespuestaAgenteUseCase({
        conversaciones: db.conversaciones,
        mensajes: db.mensajes,
        conocimiento: db.conocimiento,
        memoria: await crearMemoriaConversacionConfigurable({ config: configRepo }),
        generador: crearGeneradorRespuesta(),
        whatsapp,
        empresas: db.empresas,
        cerrarTrato,
        pipelines: db.pipeline,
        ...(configRepo ? { config: () => resolverConfigAgente({ config: configRepo }) } : {}),
      });
      const useCase = new ProcesarTareasAgenteUseCase({
        tareas: db.tareas,
        motor,
        // E3·T2: the RESPONDER_CON_INDICACION route re-reads the resolved
        // solicitud's indicación before relaunching the motor. Optional
        // dependency in the use case; the SQL repo always provides it.
        conversaciones: db.conversaciones,
        // E4·T7: the INGESTAR_CONOCIMIENTO route hands the task to the
        // ingestion processor (ingesta id travels in mensajeId). Same
        // optional-for-pre-E4 rule; the container always provides both
        // repos (getCrmDb factory).
        procesarIngesta: new ProcesarIngestaConocimientoUseCase({
          ingestas: db.ingestaConocimiento,
          conocimiento: db.conocimiento,
        }),
      });
      return useCase.ejecutar(limite);
    },
  };
}
