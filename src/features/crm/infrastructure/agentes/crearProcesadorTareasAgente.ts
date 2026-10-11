import { GenerarRespuestaAgenteUseCase } from '../../application/generarRespuestaAgente';
import { ProcesarTareasAgenteUseCase } from '../../application/procesarTareasAgente';
import type { ResultadoProcesarTareas } from '../../application/procesarTareasAgente';
import { getCrmDb } from '../getCrmDb';
import { crearMemoriaConversacion } from '../engram/crearMemoriaConversacion';
import { crearGeneradorRespuesta } from '../llm/crearGeneradorRespuesta';
import { crearEnviadorWhatsapp } from '../whatsapp/crearEnviadorWhatsapp';

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
      if (!db.conversaciones || !db.mensajes || !db.conocimiento || !db.tareas) {
        throw new Error('CRM no configurado: faltan repositorios de conversaciones/mensajes/conocimiento/tareas');
      }
      const motor = new GenerarRespuestaAgenteUseCase({
        conversaciones: db.conversaciones,
        mensajes: db.mensajes,
        conocimiento: db.conocimiento,
        memoria: crearMemoriaConversacion(),
        generador: crearGeneradorRespuesta(),
        whatsapp: crearEnviadorWhatsapp(),
        empresas: db.empresas,
      });
      const useCase = new ProcesarTareasAgenteUseCase({
        tareas: db.tareas,
        motor,
        // E3·T2: the RESPONDER_CON_INDICACION route re-reads the resolved
        // solicitud's indicación before relaunching the motor. Optional
        // dependency in the use case; the SQL repo always provides it.
        conversaciones: db.conversaciones,
      });
      return useCase.ejecutar(limite);
    },
  };
}
