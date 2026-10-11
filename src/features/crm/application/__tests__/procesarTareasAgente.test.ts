import { describe, expect, it } from 'vitest';

import type { ResultadoCrearTarea, TareaAgente, TipoTareaAgente } from '../../domain/entities';
import type {
  EntradaCrearTareaAgente,
  TareaAgenteRepository,
} from '../../domain/ports';
import type { ResultadoAgente } from '../generarRespuestaAgente';
import { ProcesarTareasAgenteUseCase } from '../procesarTareasAgente';

/**
 * Use-case contract for the agent-task queue drain (agente-ia-crm
 * E2·T5). Hexagonal: exercised against the TareaAgenteRepository PORT
 * and a scripted motor fake — the SQL adapter has its own integration
 * suite. Pinned here:
 * - Claiming: reclamarPendientes(limite) then reclamarAbandonadas
 *   (limite, 5), deduped by id — a row visible to both claims is
 *   processed exactly once.
 * - Motor mapping: RESPONDIDO | ESCALADO | CONVERSACION_NO_ACTIVA_IA
 *   → completar (task dead); FUERA_DE_HORARIO | AGENTE_DESHABILITADO
 *   → reencolar (NOT a failure — no attempt counted), reported
 *   'REENCOLADA'; FALLIDO_ENVIO → fallar('FALLIDO_ENVIO'), reported
 *   'FALLIDA' when this was the 3rd attempt (intentos + 1 >= 3), else
 *   'REENCOLADA'.
 * - A motor throw → fallar(error.message) with the same derivation,
 *   caught PER TASK: one failing task never stops the batch.
 */

class FakeTareas implements TareaAgenteRepository {
  filas: TareaAgente[] = [];
  /** Call log per operation — the assertions read these. */
  reclamosPendientes: number[] = [];
  reclamosAbandonadas: Array<{ limite: number; minutos: number }> = [];
  completadas: number[] = [];
  reencoladas: number[] = [];
  fallos: Array<{ id: number; error: string }> = [];
  creaciones: EntradaCrearTareaAgente[] = [];
  private siguienteId = 1;

  sembrar(sobres: Partial<TareaAgente> & Pick<TareaAgente, 'conversacionId' | 'mensajeId'>): TareaAgente {
    const tarea: TareaAgente = {
      id: this.siguienteId++,
      tipo: 'GENERAR_RESPUESTA' satisfies TipoTareaAgente,
      estado: 'PENDIENTE',
      intentos: 0,
      error: null,
      creadoEn: new Date(),
      reclamadaEn: null,
      procesadaEn: null,
      ...sobres,
    };
    this.filas.push(tarea);
    return tarea;
  }

  private porId(id: number): TareaAgente | undefined {
    return this.filas.find((t) => t.id === id);
  }

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<ResultadoCrearTarea> {
    this.creaciones.push({ ...entrada });
    const existente = this.filas.find(
      (t) =>
        t.conversacionId === entrada.conversacionId &&
        t.mensajeId === entrada.mensajeId &&
        t.tipo === entrada.tipo,
    );
    if (existente !== undefined) return { id: existente.id, creada: false };
    const tarea = this.sembrar({ conversacionId: entrada.conversacionId, mensajeId: entrada.mensajeId });
    return { id: tarea.id, creada: true };
  }

  async reclamarPendientes(limite: number): Promise<TareaAgente[]> {
    this.reclamosPendientes.push(limite);
    const reclamadas = this.filas
      .filter((t) => t.estado === 'PENDIENTE')
      .slice(0, limite)
      .map((t) => ({ ...t, estado: 'PROCESANDO' as const, reclamadaEn: new Date() }));
    for (const reclamada of reclamadas) {
      const fila = this.porId(reclamada.id);
      if (fila !== undefined) {
        fila.estado = 'PROCESANDO';
        fila.reclamadaEn = reclamada.reclamadaEn;
      }
    }
    return reclamadas;
  }

  async reclamarAbandonadas(limite: number, minutos: number): Promise<TareaAgente[]> {
    this.reclamosAbandonadas.push({ limite, minutos });
    return [];
  }

  async completar(id: number): Promise<void> {
    this.completadas.push(id);
    const fila = this.porId(id);
    if (fila !== undefined) {
      fila.estado = 'COMPLETADA';
      fila.procesadaEn = new Date();
      fila.error = null;
    }
  }

  async reencolar(id: number): Promise<void> {
    this.reencoladas.push(id);
    const fila = this.porId(id);
    if (fila !== undefined) fila.estado = 'PENDIENTE';
  }

  async fallar(id: number, error: string): Promise<void> {
    this.fallos.push({ id, error });
    const fila = this.porId(id);
    if (fila === undefined) return;
    fila.intentos += 1;
    fila.error = error;
    if (fila.intentos >= 3) {
      fila.estado = 'FALLIDA';
      fila.procesadaEn = new Date();
    } else {
      fila.estado = 'PENDIENTE';
    }
  }
}

type ScriptMotor = ResultadoAgente['resultado'] | Error;

interface MotorLike {
  ejecutar(conversacionId: number, ahora?: Date): Promise<ResultadoAgente>;
}

function motorConGuion(guion: ScriptMotor[]): { motor: MotorLike; llamadas: number[][] } {
  const llamadas: number[][] = [];
  const motor: MotorLike = {
    async ejecutar(conversacionId: number): Promise<ResultadoAgente> {
      llamadas.push([conversacionId]);
      const siguiente = guion.shift();
      if (siguiente instanceof Error) throw siguiente;
      return {
        conversacionId,
        resultado: siguiente ?? 'RESPONDIDO',
        mensajeId: null,
        score: null,
      };
    },
  };
  return { motor, llamadas };
}

describe('ProcesarTareasAgenteUseCase — drenaje de la cola duradera (E2·T5)', () => {
  it('cola vacía → procesadas 0 sin tocar el motor', async () => {
    const tareas = new FakeTareas();
    const { motor, llamadas } = motorConGuion([]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado).toEqual({ procesadas: 0, resultados: [] });
    expect(llamadas).toHaveLength(0);
  });

  it('RESPONDIDO → completar y reporta el resultado del motor', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const { motor } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado).toEqual({ procesadas: 1, resultados: [{ tareaId: tarea.id, resultado: 'RESPONDIDO' }] });
    expect(tareas.completadas).toEqual([tarea.id]);
    expect(tareas.fallos).toEqual([]);
    expect(tareas.reencoladas).toEqual([]);
  });

  it('ESCALADO → completar (la tarea murió: el humano toma el relevo)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const { motor } = motorConGuion(['ESCALADO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'ESCALADO' }]);
    expect(tareas.completadas).toEqual([tarea.id]);
  });

  it('CONVERSACION_NO_ACTIVA_IA → completar (un humano ya la tomó)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const { motor } = motorConGuion(['CONVERSACION_NO_ACTIVA_IA']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([
      { tareaId: tarea.id, resultado: 'CONVERSACION_NO_ACTIVA_IA' },
    ]);
    expect(tareas.completadas).toEqual([tarea.id]);
  });

  it('FUERA_DE_HORARIO → reencolar SIN contar intento, reporta REENCOLADA', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const { motor } = motorConGuion(['FUERA_DE_HORARIO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.reencoladas).toEqual([tarea.id]);
    expect(tareas.fallos).toEqual([]);
    expect(tareas.filas[0]?.intentos).toBe(0);
  });

  it('AGENTE_DESHABILITADO → reencolar sin intento, reporta REENCOLADA', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const { motor } = motorConGuion(['AGENTE_DESHABILITADO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.reencoladas).toEqual([tarea.id]);
  });

  it('FALLIDO_ENVIO con intentos 0 → fallar y reporta REENCOLADA (1 < 3)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101, intentos: 0 });
    const { motor } = motorConGuion(['FALLIDO_ENVIO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.fallos).toEqual([{ id: tarea.id, error: 'FALLIDO_ENVIO' }]);
    expect(tareas.filas[0]?.intentos).toBe(1);
  });

  it('FALLIDO_ENVIO con intentos 2 → tercer intento: FALLIDA', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101, intentos: 2 });
    const { motor } = motorConGuion(['FALLIDO_ENVIO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'FALLIDA' }]);
    expect(tareas.fallos).toEqual([{ id: tarea.id, error: 'FALLIDO_ENVIO' }]);
  });

  it('motor lanza → fallar con el mensaje y derivación por intentos', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101, intentos: 0 });
    const { motor } = motorConGuion([new Error('LLM_TIMEOUT')]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.fallos).toEqual([{ id: tarea.id, error: 'LLM_TIMEOUT' }]);
  });

  it('motor lanza en el 3er intento → FALLIDA', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101, intentos: 2 });
    const { motor } = motorConGuion([new Error('boom final')]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'FALLIDA' }]);
  });

  it('una tarea que revienta no detiene el lote (catch por tarea)', async () => {
    const tareas = new FakeTareas();
    const tareaA = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    const tareaB = tareas.sembrar({ conversacionId: 12, mensajeId: 102 });
    const { motor } = motorConGuion([new Error('ECONNRESET'), 'RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.procesadas).toBe(2);
    expect(resultado.resultados).toEqual([
      { tareaId: tareaA.id, resultado: 'REENCOLADA' },
      { tareaId: tareaB.id, resultado: 'RESPONDIDO' },
    ]);
    expect(tareas.completadas).toEqual([tareaB.id]);
    expect(tareas.fallos.map((f) => f.id)).toEqual([tareaA.id]);
  });

  it('dedupe por id: una fila visible en ambos reclamos se procesa una sola vez', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: 11, mensajeId: 101 });
    // Hacer que AMBOS reclamos devuelvan la misma fila.
    tareas.reclamarAbandonadas = async (limite: number) => {
      tareas.reclamosAbandonadas.push({ limite, minutos: 5 });
      return tareas.filas.filter((t) => t.id === tarea.id);
    };
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(llamadas).toHaveLength(1);
    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'RESPONDIDO' }]);
    expect(tareas.completadas).toEqual([tarea.id]);
  });

  it('reclama con el límite por defecto (10) y recupera abandonadas a los 5 minutos', async () => {
    const tareas = new FakeTareas();
    const { motor } = motorConGuion([]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    await useCase.ejecutar();

    expect(tareas.reclamosPendientes).toEqual([10]);
    expect(tareas.reclamosAbandonadas).toEqual([{ limite: 10, minutos: 5 }]);
  });

  it('ejecutar(limite) pasa el límite explícito a ambos reclamos', async () => {
    const tareas = new FakeTareas();
    const { motor } = motorConGuion([]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    await useCase.ejecutar(3);

    expect(tareas.reclamosPendientes).toEqual([3]);
    expect(tareas.reclamosAbandonadas).toEqual([{ limite: 3, minutos: 5 }]);
  });
});
