import type {
  MemoriaLista,
  NivelMemoria,
  ObservacionMemoriaEnLista,
} from '../domain/entities';
import { NotFoundError } from '../domain/errors';
import type { ConversacionCrmRepository, MemoriaConversacionPort } from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the memorias use cases share the bandeja typed 404
// (vincularConversacion precedent).
export { ConversacionNoEncontradaError };

/**
 * ListarMemoriasConversacionUseCase + GestionarMemoriaConversacionUseCase
 * (agente-ia-crm E3·T3) — the operator's memory panel over the hilo.
 *
 * LISTAR: the empresa's project observations (memoria.listarPorProyecto,
 * GET /observations?project=crm-emp-<id>) CLIENT-filtered to THIS
 * conversation's session (`chat-<conversacionId>`) plus the fixed
 * 'empresa' session — same scoping rule as buscar — newest-first,
 * with `pineada` matched by TITULO against contexto()'s pinned render
 * (the ### Pinned block carries no id — id 0 — titulo is the only
 * key). Sin empresa vinculada → empty list + empresaId null (nothing
 * to scope to). contexto is read FIRST so a fail-closed memory (prod
 * without Engram) surfaces as MEMORIA_NO_CONFIGURADA instead of an
 * empty panel that lies.
 *
 * GESTIONAR (pinear | eliminar): the ownership guard runs BEFORE any
 * write — the observation must be a member of THIS conversation's
 * project (listarPorProyecto membership), so a foreign observation
 * (another empresa's project) can never be pinned or deleted through
 * this conversation. Editar = UI composes eliminar + guardar (T5) —
 * deliberately NOT built here.
 */

/** Typed 404 when the observation is foreign to the conversation's project. */
export class MemoriaAjenaError extends NotFoundError {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'MemoriaAjenaError';
  }
}

export interface ResultadoListarMemorias {
  memorias: MemoriaLista[];
  empresaId: number | null;
}

export interface ListarMemoriasConversacionDeps {
  conversaciones: Pick<ConversacionCrmRepository, 'obtenerPorId'>;
  memoria: Pick<MemoriaConversacionPort, 'contexto' | 'listarPorProyecto'>;
}

/** The fixed empresa-level session id (locked scoping design). */
const SESION_EMPRESA = 'empresa';

/** nivel derivation (locked design): only 'empresa' is empresa-level. */
function nivelDeSesion(sesion: string): NivelMemoria {
  return sesion === SESION_EMPRESA ? 'empresa' : 'chat';
}

export class ListarMemoriasConversacionUseCase {
  constructor(private readonly deps: ListarMemoriasConversacionDeps) {}

  async ejecutar(conversacionId: number): Promise<ResultadoListarMemorias> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    if (conversacion.empresaId === null) {
      return { memorias: [], empresaId: null };
    }
    const empresaId = conversacion.empresaId;

    // contexto PRIMERO: además de dar los pineados, garantiza que un
    // adapter fail-closed (producción sin Engram) falle visiblemente
    // (MEMORIA_NO_CONFIGURADA) en vez de listar un panel vacío.
    const contexto = await this.deps.memoria.contexto(empresaId);
    const titulosPineados = new Set(contexto.map((observacion) => observacion.titulo));

    const listarPorProyecto = this.deps.memoria.listarPorProyecto;
    if (listarPorProyecto === undefined) {
      return { memorias: [], empresaId };
    }
    const filas = await listarPorProyecto.call(this.deps.memoria, empresaId);

    const sesionChat = `chat-${conversacionId}`;
    const memorias = filas
      .filter((fila) => fila.sesion === sesionChat || fila.sesion === SESION_EMPRESA)
      .map((fila) => this.aMemoriaLista(fila, titulosPineados))
      .sort(
        (a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.id - a.id,
      );
    return { memorias, empresaId };
  }

  private aMemoriaLista(fila: ObservacionMemoriaEnLista, titulosPineados: Set<string>): MemoriaLista {
    return {
      id: fila.id,
      nivel: nivelDeSesion(fila.sesion),
      tipo: fila.tipo,
      titulo: fila.titulo,
      contenido: fila.contenido,
      pineada: titulosPineados.has(fila.titulo),
      creadoEn: fila.creadoEn.toISOString(),
    };
  }
}

export interface GestionarMemoriaEntrada {
  conversacionId: number;
  observacionId: number;
  accion: 'pinear' | 'eliminar';
}

export interface GestionarMemoriaDeps {
  conversaciones: Pick<ConversacionCrmRepository, 'obtenerPorId'>;
  memoria: Pick<MemoriaConversacionPort, 'contexto' | 'listarPorProyecto' | 'pinear' | 'eliminar'>;
}

export class GestionarMemoriaConversacionUseCase {
  constructor(private readonly deps: GestionarMemoriaDeps) {}

  async ejecutar(entrada: GestionarMemoriaEntrada): Promise<{ ok: true }> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    if (conversacion.empresaId === null) {
      throw new MemoriaAjenaError(
        'La conversación no tiene empresa vinculada: no hay memorías que gestionar',
      );
    }
    const empresaId = conversacion.empresaId;

    // Guardia de propiedad ANTES de escribir: la observación debe ser
    // miembro del proyecto de ESTA empresa (crm-emp-<empresaId>) — un
    // id ajeno jamás se pinea ni se borra por esta vía.
    const listarPorProyecto = this.deps.memoria.listarPorProyecto;
    if (listarPorProyecto === undefined) {
      throw new Error(
        'gestionarMemoria requiere un adaptador de memoria con listarPorProyecto (capacidad E3·T3)',
      );
    }
    const filas = await listarPorProyecto.call(this.deps.memoria, empresaId);
    const esPropia = filas.some((fila) => fila.id === entrada.observacionId);
    if (!esPropia) {
      throw new MemoriaAjenaError('La memoria no pertenece a esta conversación');
    }

    if (entrada.accion === 'pinear') {
      await this.deps.memoria.pinear(entrada.observacionId);
      return { ok: true };
    }

    const eliminar = this.deps.memoria.eliminar;
    if (eliminar === undefined) {
      throw new Error(
        'gestionarMemoria requiere un adaptador de memoria con eliminar (capacidad E3·T3)',
      );
    }
    await eliminar.call(this.deps.memoria, entrada.observacionId, empresaId);
    return { ok: true };
  }
}
