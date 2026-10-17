import type { EstadoConversacion, ModoConversacion } from '../domain/entities';
import type { ConversacionCrmRepository } from '../domain/ports';
import type { ConfigAgente } from './configAgente';
import { crearConfigAgente } from './configAgente';
import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the ajustes use case shares the bandeja typed 404 (the
// memorias/ficha precedent).
export { ConversacionNoEncontradaError };

/**
 * AjustesConversacionUseCase (agente-ia-crm E3·T5) — the operator's
 * settings panel over the hilo: the conversation's LIVE columns
 * (estado, modo, asignadaA, memoriaActiva) plus the PUBLIC agent
 * config values the chips render (umbralConfianza, maxIntercambios,
 * horarioDesde, horarioHasta). The config is engine-wide (env-backed,
 * configAgente) — per-conversation ONLY memoriaActiva is editable,
 * and `actualizarMemoriaActiva` is the single write. NO secret ever
 * crosses (habilitado/textoEscalado stay server-side).
 *
 * `config` is injectable so tests stay deterministic (configAgente
 * precedent); the default reads the live process env.
 */

/** The PUBLIC config projection (mockup .cfgchips: umbral/intercambios/horario). */
export interface ConfigAgenteAjustes {
  umbralConfianza: number;
  maxIntercambios: number;
  horarioDesde: number;
  horarioHasta: number;
}

/** The settings panel payload (GET /ajustes success body minus `success`). */
export interface AjustesConversacion {
  estado: EstadoConversacion;
  modo: ModoConversacion;
  asignadaA: string | null;
  memoriaActiva: boolean;
  config: ConfigAgenteAjustes;
}

export interface AjustesConversacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'actualizarMemoriaActiva'
  >;
  /** Config source — default: the live env (crearConfigAgente). */
  config?: () => ConfigAgente | Promise<ConfigAgente>;
}

export class AjustesConversacionUseCase {
  constructor(private readonly deps: AjustesConversacionDeps) {}

  async obtener(conversacionId: number): Promise<AjustesConversacion> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();
    return this.proyectar(conversacion);
  }

  /**
   * Flip ONLY the memory toggle and return the REFRESHED ajustes (the
   * re-read row keeps estado/modo honest in the same payload). The
   * capability is optional on the port (actualizarModo precedent) —
   * absent fails loudly instead of silently "succeeding".
   */
  async actualizarMemoriaActiva(
    conversacionId: number,
    activa: boolean,
  ): Promise<AjustesConversacion> {
    const repo = this.deps.conversaciones;
    const actualizar = repo.actualizarMemoriaActiva;
    if (actualizar === undefined) {
      throw new Error(
        'ajustesConversacion requiere un repositorio con actualizarMemoriaActiva (capacidad E3·T5)',
      );
    }
    const conversacion = await actualizar.call(repo, conversacionId, activa);
    if (conversacion === null) throw new ConversacionNoEncontradaError();
    return this.proyectar(conversacion);
  }

  private async proyectar(conversacion: {
    estado: EstadoConversacion;
    modo: ModoConversacion;
    asignadaA: string | null;
    memoriaActiva?: boolean;
  }): Promise<AjustesConversacion> {
    const config = await (this.deps.config ?? crearConfigAgente)();
    return {
      estado: conversacion.estado,
      modo: conversacion.modo,
      asignadaA: conversacion.asignadaA,
      // Optional column (DB DEFAULT 1): undefined ≡ ON.
      memoriaActiva: conversacion.memoriaActiva ?? true,
      config: {
        umbralConfianza: config.umbralConfianza,
        maxIntercambios: config.maxIntercambios,
        horarioDesde: config.horarioDesde,
        horarioHasta: config.horarioHasta,
      },
    };
  }
}
