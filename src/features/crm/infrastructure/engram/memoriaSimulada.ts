import type {
  NivelMemoria,
  ObservacionMemoria,
  ResultadoGuardarMemoria,
} from '../../domain/entities';
import type { EntradaGuardarMemoria, MemoriaConversacionPort } from '../../domain/ports';

/**
 * SIMULATED conversation-memory adapter (agente-ia-crm E2·T2): a
 * deterministic in-memory Map/list-based MemoriaConversacionPort — no
 * network, no timers — selected by default in development via
 * crearMemoriaConversacion (missing ENGRAM_CRM_URL) and reused as the
 * test fake for the E2·T4 motor tests. It honors the same semantics it
 * can: empresa isolation, the chat/empresa session filter of `buscar`,
 * operationId dedup (same id, no duplicate entry) and pinned-only
 * `contexto`. Saves are instantly durable, so `guardar` always returns
 * estado 'comprometido'. `pinear` of an unknown id is a no-op (the dev
 * fallback must never crash the motor; the HTTP adapter is the one
 * that surfaces MEMORIA_ERROR there).
 *
 * Security: unlike the HTTP adapter this fake keeps observation
 * content strictly in process memory and logs NOTHING.
 */

/** One stored observation plus the scoping the searches filter on. */
interface EntradaMemoriaSimulada {
  id: number;
  empresaId: number;
  conversacionId: number;
  nivel: NivelMemoria;
  tipo: string;
  titulo: string;
  contenido: string;
  creadoEn: Date;
  pineada: boolean;
}

export class MemoriaSimulada implements MemoriaConversacionPort {
  private readonly entradas: EntradaMemoriaSimulada[] = [];
  private readonly idsPorOperationId = new Map<string, number>();
  private siguienteId = 1;

  async contexto(empresaId: number): Promise<ObservacionMemoria[]> {
    return this.entradas
      .filter((entrada) => entrada.empresaId === empresaId && entrada.pineada)
      .map((entrada) => this.aObservacion(entrada));
  }

  async buscar(
    consulta: string,
    empresaId: number,
    conversacionId: number,
    limite: number,
  ): Promise<ObservacionMemoria[]> {
    const aguja = consulta.trim().toLowerCase();
    return this.entradas
      .filter((entrada) => entrada.empresaId === empresaId)
      .filter(
        (entrada) =>
          entrada.nivel === 'empresa' ||
          (entrada.nivel === 'chat' && entrada.conversacionId === conversacionId),
      )
      .filter(
        (entrada) =>
          aguja === '' ||
          entrada.titulo.toLowerCase().includes(aguja) ||
          entrada.contenido.toLowerCase().includes(aguja),
      )
      .slice(0, Math.max(0, limite))
      .map((entrada) => this.aObservacion(entrada));
  }

  async guardar(entrada: EntradaGuardarMemoria): Promise<ResultadoGuardarMemoria> {
    const idExistente = this.idsPorOperationId.get(entrada.operationId);
    if (idExistente !== undefined) return { id: idExistente, estado: 'comprometido' };

    const id = this.siguienteId;
    this.siguienteId += 1;
    this.entradas.push({
      id,
      empresaId: entrada.empresaId,
      conversacionId: entrada.conversacionId,
      nivel: entrada.nivel,
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      contenido: entrada.contenido,
      creadoEn: new Date(),
      pineada: false,
    });
    this.idsPorOperationId.set(entrada.operationId, id);
    return { id, estado: 'comprometido' };
  }

  async pinear(id: number): Promise<void> {
    const entrada = this.entradas.find((candidata) => candidata.id === id);
    if (entrada === undefined) return;
    entrada.pineada = true;
  }

  private aObservacion(entrada: EntradaMemoriaSimulada): ObservacionMemoria {
    return {
      id: entrada.id,
      nivel: entrada.nivel,
      tipo: entrada.tipo,
      titulo: entrada.titulo,
      contenido: entrada.contenido,
      creadoEn: entrada.creadoEn,
    };
  }
}
