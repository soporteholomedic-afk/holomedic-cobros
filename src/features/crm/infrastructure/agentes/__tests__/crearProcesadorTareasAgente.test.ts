import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IngestaConocimiento, TareaAgente } from '@/features/crm/domain/entities';
import type {
  ConversacionCrmRepository,
  ConocimientoCrmRepository,
  CrmPanelRepositoryPort,
  IngestaConocimientoRepository,
  MensajeCrmRepository,
  TareaAgenteRepository,
} from '@/features/crm/domain/ports';
import { __setCrmDbForTests, type CrmDb } from '../../getCrmDb';
import { crearProcesadorTareasAgente } from '../crearProcesadorTareasAgente';

const motorMocks = vi.hoisted(() => ({ depsMotor: vi.fn() }));

vi.mock('../../../application/generarRespuestaAgente', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../application/generarRespuestaAgente')>();
  return {
    ...original,
    GenerarRespuestaAgenteUseCase: class extends original.GenerarRespuestaAgenteUseCase {
      constructor(deps: ConstructorParameters<typeof original.GenerarRespuestaAgenteUseCase>[0]) {
        super(deps);
        motorMocks.depsMotor(deps);
      }
    },
  };
});

/**
 * Test de despacho de la factory (agente-ia-crm E4·T7) — el ÚNICO
 * composition root: prueba que una tarea INGESTAR_CONOCIMIENTO
 * reclamada por el drenaje real (ProcesarTareasAgenteUseCase a través
 * de crearProcesadorTareasAgente) llega al procesador de ingestas con
 * los repos del CONTENEDOR (inyectado por el seam documentado de
 * getCrmDb) y completa la tarea. El routing fino por tipo vive en el
 * use case y está fijado en su propia suite; acá se fija el CABLE.
 */

function makeDbBase(): CrmDb {
  return { pool: {} as CrmDb['pool'] } as unknown as CrmDb;
}

class FakeTareas implements TareaAgenteRepository {
  filas: TareaAgente[] = [];
  completadas: number[] = [];
  private siguienteId = 1;

  sembrar(sobres: Partial<TareaAgente> & Pick<TareaAgente, 'conversacionId' | 'mensajeId'>): TareaAgente {
    const tarea: TareaAgente = {
      id: this.siguienteId++,
      tipo: 'INGESTAR_CONOCIMIENTO',
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

  async crearSiNoExiste(): Promise<{ id: number; creada: boolean }> {
    throw new Error('no requerido en este fake');
  }

  async reclamarPendientes(limite: number): Promise<TareaAgente[]> {
    return this.filas
      .filter((t) => t.estado === 'PENDIENTE')
      .slice(0, limite)
      .map((t) => ({ ...t, estado: 'PROCESANDO' as const, reclamadaEn: new Date() }));
  }

  async reclamarAbandonadas(): Promise<TareaAgente[]> {
    return [];
  }

  async completar(id: number): Promise<void> {
    this.completadas.push(id);
    const fila = this.filas.find((t) => t.id === id);
    if (fila) {
      fila.estado = 'COMPLETADA';
      fila.procesadaEn = new Date();
      fila.error = null;
    }
  }

  async reencolar(): Promise<void> {}
  async fallar(): Promise<void> {}
}

class FakeIngestas implements IngestaConocimientoRepository {
  filas = new Map<number, IngestaConocimiento>();
  procesando: number[] = [];
  completadas: Array<{ id: number; entradasCreadas: number }> = [];

  sembrar(ingesta: IngestaConocimiento): void {
    this.filas.set(ingesta.id, ingesta);
  }

  async crear(): Promise<IngestaConocimiento> {
    throw new Error('no requerido en este fake');
  }

  async obtenerPorId(id: number): Promise<IngestaConocimiento | null> {
    return this.filas.get(id) ?? null;
  }

  async listarRecientes(): Promise<IngestaConocimiento[]> {
    return [...this.filas.values()].sort((a, b) => b.id - a.id);
  }

  async marcarProcesando(id: number): Promise<void> {
    this.procesando.push(id);
    const fila = this.filas.get(id);
    if (fila) fila.estado = 'PROCESANDO';
  }

  async marcarCompletada(id: number, entradasCreadas: number): Promise<void> {
    this.completadas.push({ id, entradasCreadas });
    const fila = this.filas.get(id);
    if (fila) {
      fila.estado = 'COMPLETADA';
      fila.entradasCreadas = entradasCreadas;
    }
  }

  async marcarFallida(id: number, error: string): Promise<void> {
    const fila = this.filas.get(id);
    if (fila) {
      fila.estado = 'FALLIDA';
      fila.error = error;
    }
  }
}

class FakeConocimiento implements Pick<ConocimientoCrmRepository, 'listarActivas' | 'buscarPorTexto' | 'crearEntrada'> {
  creadas: Array<{ titulo: string; etiquetas: string[]; origen: string | undefined }> = [];

  async listarActivas(): Promise<never[]> {
    return [];
  }

  async buscarPorTexto(): Promise<never[]> {
    return [];
  }

  async crearEntrada(entrada: {
    titulo: string;
    contenido: string;
    etiquetas: string[];
    origen?: 'MANUAL' | 'SEMILLA' | 'SUBIDO';
  }): Promise<Awaited<ReturnType<NonNullable<ConocimientoCrmRepository['crearEntrada']>>>> {
    this.creadas.push({ titulo: entrada.titulo, etiquetas: entrada.etiquetas, origen: entrada.origen });
    return {
      id: this.creadas.length,
      titulo: entrada.titulo,
      contenido: entrada.contenido,
      etiquetas: entrada.etiquetas,
      vigenciaDesde: null,
      vigenciaHasta: null,
      activo: true,
    };
  }
}

function armarDb(tareas: FakeTareas, ingestas: FakeIngestas, conocimiento: FakeConocimiento): CrmDb {
  return {
    ...makeDbBase(),
    conversaciones: {} as ConversacionCrmRepository,
    mensajes: {} as MensajeCrmRepository,
    conocimiento: conocimiento as ConocimientoCrmRepository,
    panel: {} as CrmPanelRepositoryPort,
    tareas,
    ingestaConocimiento: ingestas,
  };
}

afterEach(() => {
  __setCrmDbForTests(null);
  motorMocks.depsMotor.mockClear();
});

describe('crearProcesadorTareasAgente — config en caliente (E5·T3 gap)', () => {
  interface DepsMotor {
    config?: () => Promise<{ umbralConfianza: number }>;
  }

  it('inyecta un resolver al motor cuando db.config existe (la fila de DB manda sobre env)', async () => {
    vi.stubEnv('AGENTE_UMBRAL_CONF', '0.5');
    const db = armarDb(new FakeTareas(), new FakeIngestas(), new FakeConocimiento());
    __setCrmDbForTests({
      ...db,
      config: {
        listar: async () => [
          {
            clave: 'agente.umbralConfianza',
            valor: '0.9',
            esSecreto: false,
            actualizadoPor: 'admin',
            actualizadoEn: new Date(),
          },
        ],
      } as unknown as NonNullable<CrmDb['config']>,
    });

    await crearProcesadorTareasAgente().procesar(1);

    const deps = motorMocks.depsMotor.mock.calls[0]?.[0] as DepsMotor;
    expect(deps.config).toBeTypeOf('function');
    expect((await deps.config?.())?.umbralConfianza).toBe(0.9);
    vi.unstubAllEnvs();
  });

  it('sin db.config el motor no recibe resolver (cae a env)', async () => {
    __setCrmDbForTests(armarDb(new FakeTareas(), new FakeIngestas(), new FakeConocimiento()));

    await crearProcesadorTareasAgente().procesar(1);

    const deps = motorMocks.depsMotor.mock.calls[0]?.[0] as DepsMotor;
    expect(deps.config).toBeUndefined();
  });
});

describe('crearProcesadorTareasAgente — cierre autónomo (E5·T10)', () => {
  interface DepsMotorCierre {
    cerrarTrato?: { execute?: unknown };
    pipelines?: unknown;
    whatsapp?: unknown;
  }

  it('el motor recibe la capacidad de cierre y el repo de pipelines del contenedor', async () => {
    const pipeline = { obtenerPorEmpresaId: async () => null } as unknown as NonNullable<CrmDb['pipeline']>;
    __setCrmDbForTests({
      ...armarDb(new FakeTareas(), new FakeIngestas(), new FakeConocimiento()),
      pipeline,
      empresas: {} as NonNullable<CrmDb['empresas']>,
    });

    await crearProcesadorTareasAgente().procesar(1);

    const deps = motorMocks.depsMotor.mock.calls[0]?.[0] as DepsMotorCierre;
    expect(deps.cerrarTrato?.execute).toBeTypeOf('function');
    expect(deps.pipelines).toBe(pipeline);
  });
});

describe('crearProcesadorTareasAgente — cable INGESTAR_CONOCIMIENTO (E4·T7)', () => {
  it('una tarea INGESTAR reclamada se ingesta de punta a punta con los repos del contenedor y queda COMPLETADA', async () => {
    const tareas = new FakeTareas();
    const ingestas = new FakeIngestas();
    const conocimiento = new FakeConocimiento();
    ingestas.sembrar({
      id: 77,
      nombre: 'Manual operativo 2026.pdf',
      tipo: 'PDF',
      tamanoBytes: 100,
      contenidoCrudo: 'primera parte chica\n\nsegunda parte chica',
      estado: 'PENDIENTE',
      error: null,
      entradasCreadas: 0,
      creadoPor: null,
      creadoEn: new Date(),
      procesadoEn: null,
      vigenciaDesde: null,
      vigenciaHasta: null,
    });
    const tarea = tareas.sembrar({ conversacionId: null, mensajeId: 77 });
    __setCrmDbForTests(armarDb(tareas, ingestas, conocimiento));

    const resultado = await crearProcesadorTareasAgente().procesar(10);

    expect(resultado.procesadas).toBe(1);
    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'INGESTADA' }]);
    expect(conocimiento.creadas).toHaveLength(1);
    expect(conocimiento.creadas[0]?.titulo).toBe('Manual operativo 2026.pdf — parte 1 de 1');
    expect(conocimiento.creadas[0]?.origen).toBe('SUBIDO');
    expect(conocimiento.creadas[0]?.etiquetas).toContain('subido');
    expect(ingestas.completadas).toEqual([{ id: 77, entradasCreadas: 1 }]);
    expect(tareas.completadas).toEqual([tarea.id]);
  });

  it('ingesta desaparecida → no-op silencioso y la tarea IGUAL se completa (sin reintentos infinitos)', async () => {
    const tareas = new FakeTareas();
    const ingestas = new FakeIngestas();
    const conocimiento = new FakeConocimiento();
    const tarea = tareas.sembrar({ conversacionId: null, mensajeId: 999_999 });
    __setCrmDbForTests(armarDb(tareas, ingestas, conocimiento));

    const resultado = await crearProcesadorTareasAgente().procesar(10);

    expect(resultado.resultados).toEqual([{ tareaId: tarea.id, resultado: 'INGESTADA' }]);
    expect(conocimiento.creadas).toHaveLength(0);
    expect(tareas.completadas).toEqual([tarea.id]);
  });
});
