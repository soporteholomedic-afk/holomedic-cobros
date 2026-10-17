import { describe, expect, it } from 'vitest';

import type { ResultadoCrearTarea, SolicitudAyuda, TareaAgente, TipoTareaAgente } from '../../domain/entities';
import type {
  EntradaCrearTareaAgente,
  TareaAgenteRepository,
} from '../../domain/ports';
import type { ResultadoAgente } from '../generarRespuestaAgente';
import type { ResultadoProcesarIngesta } from '../conocimiento/procesarIngestaConocimiento';
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
  ejecutar(
    conversacionId: number,
    ahora?: Date,
    opciones?: { indicacionHumana?: string },
  ): Promise<ResultadoAgente>;
}

interface LlamadaMotor {
  conversacionId: number;
  opciones?: { indicacionHumana?: string };
}

function motorConGuion(guion: ScriptMotor[]): { motor: MotorLike; llamadas: LlamadaMotor[] } {
  const llamadas: LlamadaMotor[] = [];
  const motor: MotorLike = {
    async ejecutar(conversacionId: number, _ahora?: Date, opciones?: { indicacionHumana?: string }): Promise<ResultadoAgente> {
      llamadas.push({ conversacionId, opciones });
      const siguiente = guion.shift();
      if (siguiente instanceof Error) throw siguiente;
      return {
        conversacionId,
        resultado: siguiente ?? 'RESPONDIDO',
        mensajeId: null,
        score: null,
        senalCierre: null,
        cierre: null,
      };
    },
  };
  return { motor, llamadas };
}

/** Structural fake for the E3·T2 route dep: the resolved-solicitud read. */
class FakeConversacionesSolicitudes {
  resueltas: SolicitudAyuda[] = [];

  async obtenerUltimaSolicitudResuelta(conversacionId: number): Promise<SolicitudAyuda | null> {
    const candidatas = this.resueltas
      .filter((s) => s.conversacionId === conversacionId)
      .sort((a, b) => b.id - a.id);
    const fila = candidatas[0];
    return fila ? structuredClone(fila) : null;
  }
}

function solicitudResuelta(sobres: Partial<SolicitudAyuda> = {}): SolicitudAyuda {
  return {
    id: 21,
    conversacionId: 11,
    mensajeId: 101,
    consulta: '¿Hacen exámenes los sábados?',
    terminosBuscados: ['examenes', 'sabados'],
    score: 0.3,
    estado: 'RESUELTA',
    indicacion: 'Decile que sí, los sábados por la mañana.',
    resueltaPor: 'ana',
    creadoEn: new Date(2026, 5, 15, 9, 0, 0),
    resueltaEn: new Date(2026, 5, 15, 10, 0, 0),
    ...sobres,
  };
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

describe('ProcesarTareasAgenteUseCase — ruta RESPONDER_CON_INDICACION (E3·T2)', () => {
  it('relee la solicitud RESUELTA y pasa su indicación al motor como opciones; RESPONDIDO → completar', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: 11,
      mensajeId: 101,
      tipo: 'RESPONDER_CON_INDICACION' satisfies TipoTareaAgente,
    });
    const conversaciones = new FakeConversacionesSolicitudes();
    conversaciones.resueltas.push(solicitudResuelta());
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, conversaciones });

    const resultado = await useCase.ejecutar();

    expect(llamadas).toEqual([
      { conversacionId: 11, opciones: { indicacionHumana: 'Decile que sí, los sábados por la mañana.' } },
    ]);
    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'RESPONDIDO' }]);
    expect(tareas.completadas).toEqual([tarea.id]);
    expect(tareas.fallos).toEqual([]);
  });

  it('FUERA_DE_HORARIO en la ruta con indicación → reencolar SIN intento (misma semántica que GENERAR_RESPUESTA)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: 11,
      mensajeId: 101,
      tipo: 'RESPONDER_CON_INDICACION',
    });
    const conversaciones = new FakeConversacionesSolicitudes();
    conversaciones.resueltas.push(solicitudResuelta());
    const { motor } = motorConGuion(['FUERA_DE_HORARIO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, conversaciones });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.reencoladas).toEqual([tarea.id]);
    expect(tareas.fallos).toEqual([]);
    expect(tareas.filas[0]?.intentos).toBe(0);
  });

  it('sin solicitud RESUELTA → falla la tarea con error de inconsistencia (intento contado)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: 11,
      mensajeId: 101,
      tipo: 'RESPONDER_CON_INDICACION',
    });
    const conversaciones = new FakeConversacionesSolicitudes();
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, conversaciones });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(llamadas).toHaveLength(0);
    expect(tareas.fallos).toHaveLength(1);
    expect(tareas.fallos[0]?.error).toContain('solicitud');
  });

  it('solicitud resuelta SIN indicación → falla igual (datos inconsistentes)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: 11,
      mensajeId: 101,
      tipo: 'RESPONDER_CON_INDICACION',
    });
    const conversaciones = new FakeConversacionesSolicitudes();
    conversaciones.resueltas.push(solicitudResuelta({ indicacion: null }));
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, conversaciones });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(llamadas).toHaveLength(0);
    expect(tareas.fallos).toHaveLength(1);
  });

  it('dep conversaciones ausente → falla la tarea (capacidad E3 sin cablear, nunca responde a ciegas)', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: 11,
      mensajeId: 101,
      tipo: 'RESPONDER_CON_INDICACION',
    });
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(llamadas).toHaveLength(0);
    expect(tareas.fallos).toHaveLength(1);
    expect(tareas.fallos[0]?.error).toContain('obtenerUltimaSolicitudResuelta');
  });

  it('GENERAR_RESPUESTA sigue yendo al motor SIN opciones (ruta intacta)', async () => {
    const tareas = new FakeTareas();
    tareas.sembrar({ conversacionId: 11, mensajeId: 101, tipo: 'GENERAR_RESPUESTA' });
    const conversaciones = new FakeConversacionesSolicitudes();
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, conversaciones });

    await useCase.ejecutar();

    expect(llamadas).toEqual([{ conversacionId: 11, opciones: undefined }]);
    expect(conversaciones.resueltas).toEqual([]);
  });
});

describe('ProcesarTareasAgenteUseCase — ruta INGESTAR_CONOCIMIENTO (E4·T7)', () => {
  /** Fake estructural del procesador de ingestas (el dep opcional). */
  function procesarIngestaFake(errores: Error[] = []): {
    procesarIngesta: { ejecutar(entrada: { ingestaId: number }): Promise<ResultadoProcesarIngesta> };
    llamadas: number[];
  } {
    const llamadas: number[] = [];
    return {
      procesarIngesta: {
        async ejecutar(entrada: { ingestaId: number }): Promise<ResultadoProcesarIngesta> {
          const error = errores.shift();
          if (error) throw error;
          llamadas.push(entrada.ingestaId);
          return { ingestaId: entrada.ingestaId, estado: 'COMPLETADA', entradasCreadas: 2 };
        },
      },
      llamadas,
    };
  }

  it('la tarea INGESTAR va al procesador de ingestas (mensajeId = ingestaId), NUNCA al motor; COMPLETADA e INGESTADA', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({
      conversacionId: null,
      mensajeId: 77,
      tipo: 'INGESTAR_CONOCIMIENTO' satisfies TipoTareaAgente,
    });
    const { procesarIngesta, llamadas: llamadasIngesta } = procesarIngestaFake();
    const { motor, llamadas: llamadasMotor } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, procesarIngesta });

    const resultado = await useCase.ejecutar();

    expect(llamadasIngesta).toEqual([77]);
    expect(llamadasMotor, 'el motor jamás ve una tarea de ingesta').toHaveLength(0);
    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'INGESTADA' }]);
    expect(tareas.completadas, 'el use case de ingesta NUNCA lanza por fallos de contenido → la tarea se completa (un PDF corrupto no se reencola infinito)').toEqual([tarea.id]);
    expect(tareas.fallos).toEqual([]);
  });

  it('dep procesarIngesta ausente → falla la tarea (capacidad E4 sin cablear, espejo E3; intento contado)', async () => {
    const tareas = new FakeTareas();
    tareas.sembrar({ conversacionId: null, mensajeId: 77, tipo: 'INGESTAR_CONOCIMIENTO' });
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tareas.filas[0]?.id, resultado: 'REENCOLADA' }]);
    expect(llamadas).toHaveLength(0);
    expect(tareas.fallos).toHaveLength(1);
    expect(tareas.fallos[0]?.error).toContain('procesarIngesta');
  });

  it('GENERAR/RESPONDER con conversacionId NULL → inconsistencia de datos: falla ruidoso, nunca responde a ciegas', async () => {
    const tareas = new FakeTareas();
    tareas.sembrar({ conversacionId: null, mensajeId: 101, tipo: 'GENERAR_RESPUESTA' });
    const { motor, llamadas } = motorConGuion(['RESPONDIDO']);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor });

    const resultado = await useCase.ejecutar();

    expect(llamadas, 'el motor no se invoca sin conversación').toHaveLength(0);
    expect(resultado.resultados).toEqual([{ tareaId: tareas.filas[0]?.id, resultado: 'REENCOLADA' }]);
    expect(tareas.fallos).toHaveLength(1);
    expect(tareas.fallos[0]?.error).toContain('conversacionId');
  });

  it('si el procesador de ingestas LANZA (fallo de infraestructura, p.ej. marcarFallida) → cuenta intento y reintenta', async () => {
    const tareas = new FakeTareas();
    const tarea = tareas.sembrar({ conversacionId: null, mensajeId: 77, tipo: 'INGESTAR_CONOCIMIENTO' });
    const { procesarIngesta } = procesarIngestaFake([new Error('DB caída al marcar')]);
    const { motor } = motorConGuion([]);
    const useCase = new ProcesarTareasAgenteUseCase({ tareas, motor, procesarIngesta });

    const resultado = await useCase.ejecutar();

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'REENCOLADA' }]);
    expect(tareas.fallos).toEqual([{ id: tarea.id, error: 'DB caída al marcar' }]);
    expect(tareas.filas[0]?.intentos).toBe(1);
    expect(tareas.completadas).toEqual([]);
  });
});
