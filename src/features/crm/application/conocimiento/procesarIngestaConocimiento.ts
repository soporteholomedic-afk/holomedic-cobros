import type { IngestaConocimientoRepository, ConocimientoCrmRepository } from '../../domain/ports';

import { chunkearTexto } from './chunkearTexto';
import { sugerirEtiquetas } from './sugerirEtiquetas';

/**
 * ProcesarIngestaConocimientoUseCase (agente-ia-crm E4·T7) — el
 * worker de la cola para tareas INGESTAR_CONOCIMIENTO: toma la
 * ingesta, trocea su crudo (chunkearTexto) y crea UNA entrada de
 * CRM_Conocimiento por chunk con etiquetas sugeridas
 * (sugerirEtiquetas), vigencia heredada y origen SUBIDO. Cierra en
 * COMPLETADA(n) — o FALLIDA(mensaje) si algo revienta.
 *
 * CONTRATO DE ERRORES: este use case NUNCA lanza por fallos de
 * negocio del contenido — cualquier error se traga en marcarFallida
 * (un PDF corrupto no mejora con reintentos, así la tarea de la cola
 * se COMPLETA y la ingesta queda FALLIDA auditable; el reparto de la
 * tarea vive en ProcesarTareasAgente). La ÚNICA excepción es el
 * precondition del wiring: un repo sin crearEntrada es un bug de
 * composición y revienta RUIDOSO antes de tocar la ingesta
 * (aplicarIndicacion precedent).
 *
 * IDEMPOTENCIA: una ingesta ya COMPLETADA/FALLIDA es no-op (el
 * reclaim de crash del barredor puede re-ejecutar la tarea; sin este
 * guard duplicaría entradas — los titulos son deterministas, así que
 * un reproceso real crearía copias idénticas). Queda el riesgo
 * documentado de crash A mitad del bucle: la re-ejecución recrearía
 * los chunks ya creados — ventana mínima, aceptada por diseño igual
 * que el double-send del motor (E2·T4).
 */

/** Resultado observado de una ejecución del procesador. */
export interface ResultadoProcesarIngesta {
  ingestaId: number;
  estado: 'AUSENTE' | 'COMPLETADA' | 'FALLIDA';
  entradasCreadas: number;
}

export interface ProcesarIngestaConocimientoDeps {
  ingestas: IngestaConocimientoRepository;
  /** Escritura de entradas (capacidad opcional del port de conocimiento). */
  conocimiento: Pick<ConocimientoCrmRepository, 'crearEntrada'>;
}

/** El titulo vive en NVARCHAR(200) (adapter precedent: el límite acá). */
const TITULO_MAX_CARACTERES = 200;

export class ProcesarIngestaConocimientoUseCase {
  constructor(private readonly deps: ProcesarIngestaConocimientoDeps) {}

  async ejecutar(entrada: { ingestaId: number }): Promise<ResultadoProcesarIngesta> {
    const crearEntrada = this.deps.conocimiento.crearEntrada;
    if (crearEntrada === undefined) {
      throw new Error(
        'procesarIngestaConocimiento requiere un repositorio con crearEntrada (capacidad E4·T7)',
      );
    }

    const ingestaId = entrada.ingestaId;
    const ingesta = await this.deps.ingestas.obtenerPorId(ingestaId);
    if (ingesta === null) {
      // Fila desaparecida (purga manual entre encolado y drenado): los
      // processors no inventan trabajo — no-op silencioso.
      return { ingestaId, estado: 'AUSENTE', entradasCreadas: 0 };
    }
    if (ingesta.estado === 'COMPLETADA' || ingesta.estado === 'FALLIDA') {
      // Replay del barredor sobre una ingesta ya cerrada: no-op.
      return {
        ingestaId,
        estado: ingesta.estado,
        entradasCreadas: ingesta.entradasCreadas,
      };
    }

    await this.deps.ingestas.marcarProcesando(ingestaId);
    try {
      const trozos = chunkearTexto(ingesta.contenidoCrudo ?? '');
      const total = trozos.length;
      let creadas = 0;
      // .call(…): la capacidad se lee del port (método opcional) y debe
      // correr atada a su repo (crearHueco precedent).
      for (let i = 0; i < total; i++) {
        const trozo = trozos[i] ?? '';
        await crearEntrada.call(this.deps.conocimiento, {
          titulo: `${ingesta.nombre} — parte ${i + 1} de ${total}`.slice(0, TITULO_MAX_CARACTERES),
          contenido: trozo,
          etiquetas: sugerirEtiquetas(trozo),
          vigenciaDesde: ingesta.vigenciaDesde,
          vigenciaHasta: ingesta.vigenciaHasta,
          origen: 'SUBIDO',
        });
        creadas += 1;
      }
      await this.deps.ingestas.marcarCompletada(ingestaId, creadas);
      return { ingestaId, estado: 'COMPLETADA', entradasCreadas: creadas };
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : String(error);
      // Reporte de error existente de los processors (procesarTareasAgente):
      // console.error estructurado, nunca datos sensibles.
      console.error('[procesarIngestaConocimiento] ingesta fallida', {
        ingestaId,
        error: mensaje,
      });
      await this.deps.ingestas.marcarFallida(ingestaId, mensaje);
      return { ingestaId, estado: 'FALLIDA', entradasCreadas: 0 };
    }
  }
}
