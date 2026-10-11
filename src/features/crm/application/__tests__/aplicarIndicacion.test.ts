import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConversacionCrm,
  HuecoConocimiento,
  MensajeCrm,
  ObservacionMemoria,
  ResultadoCrearTarea,
  ResultadoGuardarMemoria,
  SolicitudAyuda,
} from '../../domain/entities';
import type {
  EntradaCrearTareaAgente,
  EntradaGuardarMemoria,
  ListarMensajesOpciones,
  MemoriaConversacionPort,
} from '../../domain/ports';
import {
  AplicarIndicacionUseCase,
  AyudaNoPendienteError,
  IndicacionInvalidaError,
} from '../aplicarIndicacion';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';

/**
 * Use-case contract for aplicarIndicacion (agente-ia-crm E3·T2) —
 * the operator answers a pending help request with an indicación:
 * memory pin (best-effort, chat level, tipo indicacion_humana) →
 * KB-gap candidate (CORE, same DB) → resolve the solicitud (CORE,
 * resueltaPor = nombre||usuarioId) → idempotent
 * RESPONDER_CON_INDICACION task (CORE, mensajeId from the solicitud
 * with last-IN fallback). The indicación's durable source of truth is
 * the solicitud ROW — memory is enrichment, never a dependency.
 * Typed errors: ConversacionNoEncontradaError (404),
 * AyudaNoPendienteError (404 — nothing to apply), IndicacionInvalidaError
 * (400 — blank or > 2000 chars). A missing E3 capability on the repo
 * throws (this use case only exists with E3 wired).
 */

class FakeConversacionesAplicar {
  filas: ConversacionCrm[] = [];
  pendientes: SolicitudAyuda[] = [];
  resueltas: Array<{ id: number; indicacion: string; resueltaPor: string }> = [];

  constructor(private readonly orden: string[] = []) {}

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  sembrarSolicitud(sobres: Partial<SolicitudAyuda> = {}): SolicitudAyuda {
    const fila: SolicitudAyuda = {
      id: 11,
      conversacionId: 1,
      mensajeId: 55,
      consulta: '¿Hacen exámenes los sábados?',
      terminosBuscados: ['hacen', 'examenes', 'sabados'],
      score: 0.3,
      estado: 'PENDIENTE',
      indicacion: null,
      resueltaPor: null,
      creadoEn: new Date(2026, 5, 15, 9, 0, 0),
      resueltaEn: null,
      ...sobres,
    };
    this.pendientes.push(fila);
    return fila;
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async obtenerSolicitudAyudaPendiente(conversacionId: number): Promise<SolicitudAyuda | null> {
    const pendientes = this.pendientes
      .filter((s) => s.conversacionId === conversacionId && s.estado === 'PENDIENTE')
      .sort((a, b) => b.id - a.id);
    const fila = pendientes[0];
    return fila ? structuredClone(fila) : null;
  }

  async resolverSolicitudAyuda(
    id: number,
    indicacion: string,
    resueltaPor: string,
  ): Promise<SolicitudAyuda> {
    this.orden.push('resolver');
    this.resueltas.push({ id, indicacion, resueltaPor });
    const fila = this.pendientes.find((s) => s.id === id);
    if (fila === undefined) throw new Error(`solicitud ${id} inexistente en el fake`);
    fila.estado = 'RESUELTA';
    fila.indicacion = indicacion;
    fila.resueltaPor = resueltaPor;
    fila.resueltaEn = new Date();
    return structuredClone(fila);
  }
}

class FakeHuecos {
  creados: Array<{ consulta: string; terminos: string[]; origenSolicitudId?: number | null }> = [];
  fallo: Error | null = null;

  constructor(private readonly orden: string[] = []) {}

  async crearHueco(entrada: {
    consulta: string;
    terminos: string[];
    origenSolicitudId?: number | null;
  }): Promise<HuecoConocimiento> {
    if (this.fallo !== null) throw this.fallo;
    this.orden.push('hueco');
    this.creados.push({ ...entrada, terminos: [...entrada.terminos] });
    return {
      id: 61,
      consulta: entrada.consulta,
      terminos: [...entrada.terminos],
      estado: 'ABIERTO',
      origenSolicitudId: entrada.origenSolicitudId ?? null,
      creadoEn: new Date(),
    };
  }
}

class FakeMemoriaAplicar implements MemoriaConversacionPort {
  guardadas: EntradaGuardarMemoria[] = [];
  pineadas: number[] = [];
  fallo: Error | null = null;

  constructor(private readonly orden: string[] = []) {}

  async contexto(): Promise<ObservacionMemoria[]> {
    throw new Error('no requerido en este fake');
  }

  async buscar(): Promise<ObservacionMemoria[]> {
    throw new Error('no requerido en este fake');
  }

  async guardar(entrada: EntradaGuardarMemoria): Promise<ResultadoGuardarMemoria> {
    if (this.fallo !== null) throw this.fallo;
    this.orden.push('memoria.guardar');
    this.guardadas.push(structuredClone(entrada));
    return { id: 501, estado: 'guardado' };
  }

  async pinear(id: number): Promise<void> {
    this.orden.push('memoria.pinear');
    this.pineadas.push(id);
  }
}

class FakeTareasAplicar {
  creaciones: EntradaCrearTareaAgente[] = [];

  constructor(private readonly orden: string[] = []) {}

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<ResultadoCrearTarea> {
    this.orden.push('tarea');
    this.creaciones.push({ ...entrada });
    return { id: 71, creada: true };
  }
}

class FakeMensajesAplicar {
  hilo: MensajeCrm[] = [];
  consultas: Array<{ conversacionId: number; limite: number }> = [];

  async listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]> {
    this.consultas.push({ conversacionId, limite: opciones.limite });
    const propias = this.hilo.filter((m) => m.conversacionId === conversacionId);
    return [...propias].reverse();
  }
}

function conversacionAplica(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: 7,
    contactoId: 42,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.1349',
    estado: 'REQUIERE_HUMANO',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: ahora,
    noLeidos: 1,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function mensajeAplica(id: number, direccion: 'IN' | 'OUT', emisor: 'CLIENTE' | 'IA'): MensajeCrm {
  return {
    id,
    conversacionId: 1,
    direccion,
    emisor,
    cuerpo: `cuerpo ${id}`,
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: `wamid.${id}`,
    idempotenciaKey: `key-${id}`,
    estadoEnvio: direccion === 'OUT' ? 'ENVIADO' : null,
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn: new Date(2026, 5, 15, 9, 0, 0).toISOString(),
  };
}

interface OverridesAplicar {
  conversacion?: ConversacionCrm | null;
  solicitud?: Partial<SolicitudAyuda> | null;
  falloMemoria?: Error;
  falloHueco?: Error;
  hilo?: MensajeCrm[];
  sinMensajes?: boolean;
}

function crearFakesAplicar(overrides: OverridesAplicar = {}): {
  orden: string[];
  conversaciones: FakeConversacionesAplicar;
  conocimiento: FakeHuecos;
  memoria: FakeMemoriaAplicar;
  tareas: FakeTareasAplicar;
  mensajes: FakeMensajesAplicar;
  useCase: AplicarIndicacionUseCase;
} {
  const orden: string[] = [];
  const conversaciones = new FakeConversacionesAplicar(orden);
  if (overrides.conversacion !== null) {
    conversaciones.sembrar(overrides.conversacion ?? conversacionAplica());
  }
  if (overrides.solicitud !== null) {
    conversaciones.sembrarSolicitud(overrides.solicitud ?? {});
  }
  const conocimiento = new FakeHuecos(orden);
  conocimiento.fallo = overrides.falloHueco ?? null;
  const memoria = new FakeMemoriaAplicar(orden);
  memoria.fallo = overrides.falloMemoria ?? null;
  const tareas = new FakeTareasAplicar(orden);
  const mensajes = new FakeMensajesAplicar();
  mensajes.hilo = overrides.hilo ?? [];
  const useCase = new AplicarIndicacionUseCase({
    conversaciones,
    conocimiento,
    memoria,
    tareas,
    ...(overrides.sinMensajes === true ? {} : { mensajes }),
  });
  return { orden, conversaciones, conocimiento, memoria, tareas, mensajes, useCase };
}

const ENTRADA_BASE = {
  conversacionId: 1,
  indicacion: 'Coordiná el examen para el viernes a las 9 y confirmale por escrito.',
  usuarioId: 'u-123',
  usuarioNombre: 'Ana Operadora',
} as const;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('AplicarIndicacionUseCase — happy path (E3·T2)', () => {
  it('aplica en ORDEN: memoria chat+pineo → hueco ABIERTO → resolver → tarea RESPONDER_CON_INDICACION', async () => {
    const fakes = crearFakesAplicar();

    const resultado = await fakes.useCase.ejecutar({ ...ENTRADA_BASE });

    // ORDEN de efectos: memoria (guardar→pinear) ANTES del hueco, la
    // resolución y la tarea — la tarea nace con la solicitud ya resuelta.
    expect(fakes.orden).toEqual([
      'memoria.guardar',
      'memoria.pinear',
      'hueco',
      'resolver',
      'tarea',
    ]);

    // Memoria: nivel chat, tipo indicacion_humana, operationId determinista + pineo.
    expect(fakes.memoria.guardadas).toEqual([
      {
        empresaId: 7,
        conversacionId: 1,
        nivel: 'chat',
        tipo: 'indicacion_humana',
        titulo: 'Indicación humana',
        contenido: ENTRADA_BASE.indicacion,
        operationId: 'indicacion-11',
      },
    ]);
    expect(fakes.memoria.pineadas).toEqual([501]);

    // Hueco: la consulta y los términos de la solicitud, ABIERTO, origen = solicitud.
    expect(fakes.conocimiento.creados).toEqual([
      {
        consulta: '¿Hacen exámenes los sábados?',
        terminos: ['hacen', 'examenes', 'sabados'],
        origenSolicitudId: 11,
      },
    ]);
    expect(resultado.hueco).toMatchObject({ estado: 'ABIERTO', origenSolicitudId: 11 });

    // Resolver con resueltaPor = nombre del operador.
    expect(fakes.conversaciones.resueltas).toEqual([
      { id: 11, indicacion: ENTRADA_BASE.indicacion, resueltaPor: 'Ana Operadora' },
    ]);
    expect(resultado.solicitud).toMatchObject({
      id: 11,
      estado: 'RESUELTA',
      indicacion: ENTRADA_BASE.indicacion,
      resueltaPor: 'Ana Operadora',
    });

    // Tarea idempotente con el mensajeId de la solicitud.
    expect(fakes.tareas.creaciones).toEqual([
      { conversacionId: 1, mensajeId: 55, tipo: 'RESPONDER_CON_INDICACION' },
    ]);
    expect(resultado.tarea).toEqual({ id: 71, creada: true });
    expect(resultado.memoria).toEqual({ guardada: true });
  });

  it('usuarioNombre ausente o en blanco → resueltaPor cae al usuarioId', async () => {
    const sinNombre = crearFakesAplicar();
    await sinNombre.useCase.ejecutar({ ...ENTRADA_BASE, usuarioNombre: undefined });
    expect(sinNombre.conversaciones.resueltas[0]?.resueltaPor).toBe('u-123');

    const nombreBlanco = crearFakesAplicar();
    await nombreBlanco.useCase.ejecutar({ ...ENTRADA_BASE, usuarioNombre: '   ' });
    expect(nombreBlanco.conversaciones.resueltas[0]?.resueltaPor).toBe('u-123');
  });

  it('mensajeId null en la solicitud → la tarea cae al último IN/CLIENTE del hilo', async () => {
    const fakes = crearFakesAplicar({
      solicitud: { mensajeId: null },
      hilo: [
        mensajeAplica(51, 'IN', 'CLIENTE'),
        mensajeAplica(52, 'OUT', 'IA'),
        mensajeAplica(53, 'IN', 'CLIENTE'),
      ],
    });

    await fakes.useCase.ejecutar({ ...ENTRADA_BASE });

    expect(fakes.mensajes.consultas).toEqual([{ conversacionId: 1, limite: 50 }]);
    expect(fakes.tareas.creaciones).toEqual([
      { conversacionId: 1, mensajeId: 53, tipo: 'RESPONDER_CON_INDICACION' },
    ]);
  });

  it('memoria falla → guardada:false y el flujo COMPLETO sigue (hueco+resolver+tarea intactos)', async () => {
    const fakes = crearFakesAplicar({
      falloMemoria: Object.assign(new Error('boom'), { codigo: 'MEMORIA_TIMEOUT' }),
    });

    const resultado = await fakes.useCase.ejecutar({ ...ENTRADA_BASE });

    expect(resultado.memoria).toEqual({ guardada: false });
    expect(fakes.memoria.pineadas).toEqual([]);
    expect(fakes.conocimiento.creados).toHaveLength(1);
    expect(fakes.conversaciones.resueltas).toHaveLength(1);
    expect(fakes.tareas.creaciones).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it('conversación sin empresaId → sin memoria (guardada:false), resto completo', async () => {
    const fakes = crearFakesAplicar({ conversacion: conversacionAplica({ empresaId: null }) });

    const resultado = await fakes.useCase.ejecutar({ ...ENTRADA_BASE });

    expect(resultado.memoria).toEqual({ guardada: false });
    expect(fakes.memoria.guardadas).toEqual([]);
    expect(fakes.conversaciones.resueltas).toHaveLength(1);
    expect(fakes.tareas.creaciones).toHaveLength(1);
  });
});

describe('AplicarIndicacionUseCase — errores tipados (E3·T2)', () => {
  it('conversación inexistente → ConversacionNoEncontradaError sin efectos', async () => {
    const fakes = crearFakesAplicar({ conversacion: null });

    await expect(fakes.useCase.ejecutar({ ...ENTRADA_BASE })).rejects.toBeInstanceOf(
      ConversacionNoEncontradaError,
    );
    expect(fakes.conocimiento.creados).toEqual([]);
    expect(fakes.conversaciones.resueltas).toEqual([]);
    expect(fakes.tareas.creaciones).toEqual([]);
  });

  it('sin solicitud PENDIENTE → AyudaNoPendienteError (NOT_FOUND) sin efectos', async () => {
    const fakes = crearFakesAplicar({ solicitud: null });

    const error = await fakes.useCase.ejecutar({ ...ENTRADA_BASE }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AyudaNoPendienteError);
    expect((error as AyudaNoPendienteError).code).toBe('NOT_FOUND_ERROR');
    expect(fakes.memoria.guardadas).toEqual([]);
    expect(fakes.conocimiento.creados).toEqual([]);
    expect(fakes.conversaciones.resueltas).toEqual([]);
    expect(fakes.tareas.creaciones).toEqual([]);
  });

  it('indicación vacía / solo espacios / mayor a 2000 → IndicacionInvalidaError (VALIDATION_ERROR)', async () => {
    for (const indicacion of ['', '   ', 'x'.repeat(2001)]) {
      const fakes = crearFakesAplicar();

      const error = await fakes.useCase.ejecutar({ ...ENTRADA_BASE, indicacion }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(IndicacionInvalidaError);
      expect((error as IndicacionInvalidaError).code).toBe('VALIDATION_ERROR');
      expect(fakes.conversaciones.resueltas).toEqual([]);
      expect(fakes.tareas.creaciones).toEqual([]);
    }
  });

  it('hueco falla → propaga (CORE) y NO resuelve ni crea tarea', async () => {
    const fakes = crearFakesAplicar({ falloHueco: new Error('FK rota') });

    await expect(fakes.useCase.ejecutar({ ...ENTRADA_BASE })).rejects.toThrow('FK rota');

    expect(fakes.conocimiento.creados).toEqual([]);
    expect(fakes.conversaciones.resueltas).toEqual([]);
    expect(fakes.tareas.creaciones).toEqual([]);
  });

  it('solicitud sin mensajeId, dep mensajes ausente y sin IN en el hilo → error sin crear tarea', async () => {
    const sinDep = crearFakesAplicar({ solicitud: { mensajeId: null }, sinMensajes: true });
    await expect(sinDep.useCase.ejecutar({ ...ENTRADA_BASE })).rejects.toThrow(/mensajeId/);
    expect(sinDep.tareas.creaciones).toEqual([]);

    const sinIn = crearFakesAplicar({
      solicitud: { mensajeId: null },
      hilo: [mensajeAplica(51, 'OUT', 'IA')],
    });
    await expect(sinIn.useCase.ejecutar({ ...ENTRADA_BASE })).rejects.toThrow(/IN/);
    expect(sinIn.tareas.creaciones).toEqual([]);
  });

  it('repo sin crearHueco (capacidad E3 ausente) → revienta, no responde a ciegas', async () => {
    const fakes = crearFakesAplicar();

    const useCase = new AplicarIndicacionUseCase({
      conversaciones: fakes.conversaciones,
      conocimiento: {},
      memoria: fakes.memoria,
      tareas: fakes.tareas,
    });

    await expect(useCase.ejecutar({ ...ENTRADA_BASE })).rejects.toThrow(/crearHueco/);
    expect(fakes.conversaciones.resueltas).toEqual([]);
  });
});
