import type {
  NivelMemoria,
  ObservacionMemoria,
  ObservacionMemoriaEnLista,
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

  /** E3·T3: raw session reconstructed from the stored scoping fields. */
  private sesionDe(entrada: EntradaMemoriaSimulada): string {
    return entrada.nivel === 'empresa' ? 'empresa' : `chat-${entrada.conversacionId}`;
  }

  async listarPorProyecto(empresaId: number): Promise<ObservacionMemoriaEnLista[]> {
    return this.entradas
      .filter((entrada) => entrada.empresaId === empresaId)
      .map((entrada) => ({
        id: entrada.id,
        sesion: this.sesionDe(entrada),
        tipo: entrada.tipo,
        titulo: entrada.titulo,
        contenido: entrada.contenido,
        creadoEn: entrada.creadoEn,
      }));
  }

  /**
   * E3·T3: soft-remove the (id, empresaId) entry — the project guard
   * mirrors expected_project: a foreign id or an id of ANOTHER empresa
   * removes nothing (no-op, the dev fake never crashes — pinear
   * precedent).
   */
  async eliminar(id: number, empresaId: number): Promise<void> {
    const indice = this.entradas.findIndex(
      (entrada) => entrada.id === id && entrada.empresaId === empresaId,
    );
    if (indice !== -1) this.entradas.splice(indice, 1);
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
