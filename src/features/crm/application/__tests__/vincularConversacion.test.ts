import { describe, expect, it } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  ContactoConEmpresa,
  MensajeCrmRepository,
  TareaAgenteRepository,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  MensajeCrm,
  ModoConversacion,
} from '../../domain/entities';
import { normalizarNombre } from '../../domain/normalizar';
import {
  ConversacionNoEncontradaError,
  ContactoNoEncontradoError,
  VincularConversacionUseCase,
  type VincularConversacionEntrada,
} from '../vincularConversacion';

/**
 * Use-case contract for the operator vinculación (agente-ia-crm E1 +
 * E2·T5 born-state/task hook). Hexagonal: exercised against the PORTS
 * with in-memory fakes — the SQL adapters stay thin. Pinned:
 * - asociar: vincular(id, {empresaId del contacto, contactoId,
 *   estado: 'ACTIVA_IA'}) + actualizarModo(id, 'IA') — E2 decision:
 *   conversations are born IA-managed at vinculación (the operator
 *   resolved WHO the client is; la Guía takes it from there) — and
 *   ONE GENERAR_RESPUESTA task is enqueued for the most recent
 *   IN/CLIENTE message so the pending client message does not wait
 *   for the NEXT inbound one.
 * - crear: crearContacto runs FIRST (nombre normalizado, cargo), then
 *   the same vincular write with the new contactoId.
 * - Contacto inexistente / conversación inexistente → typed errors.
 * - Re-vincular IS allowed (operator correction: changes the contacto).
 * - Without the new optional deps (pre-E2 construction `{ conversaciones }`)
 *   the born-state flip still happens; the task hook is skipped.
 */

interface ContactoSembrado {
  contactoId: number;
  empresaId: number;
  nombre: string;
  cargo: string | null;
  razonSocial: string | null;
}

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  contactos: ContactoSembrado[] = [];
  vinculaciones: Array<{ id: number; datos: Record<string, unknown> }> = [];
  contactosCreados: Array<{ empresaId: number; nombre: string; cargo: string | null }> = [];
  private siguienteContactoId = 100;

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  sembrarContacto(contacto: ContactoSembrado): void {
    this.contactos.push(contacto);
  }

  async crear(datos: CrearConversacionInput): Promise<ConversacionCrm> {
    const fila: ConversacionCrm = {
      id: this.filas.length + 1,
      empresaId: datos.empresaId ?? null,
      contactoId: datos.contactoId ?? null,
      canal: datos.canal,
      telefono: datos.telefono ?? null,
      identificadorCanal: datos.identificadorCanal ?? null,
      estado: datos.estado ?? 'PENDIENTE_VINCULACION',
      asignadaA: datos.asignadaA ?? null,
      modo: datos.modo ?? 'IA',
      ultimoMensajeEn: null,
      noLeidos: 0,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString(),
    };
    this.filas.push(fila);
    return structuredClone(fila);
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async buscarPorCanal(
    canal: CanalConversacion,
    clave: BuscarConversacionCanal,
  ): Promise<ConversacionCrm | null> {
    let filtradas = this.filas.filter((f) => f.canal === canal);
    if (clave.telefono !== undefined) {
      filtradas = filtradas.filter((f) => f.telefono === clave.telefono);
    } else if (clave.identificadorCanal !== undefined) {
      filtradas = filtradas.filter((f) => f.identificadorCanal === clave.identificadorCanal);
    } else {
      throw new Error('buscarPorCanal requiere telefono o identificadorCanal');
    }
    const fila = [...filtradas].sort((a, b) => b.id - a.id)[0];
    return fila ? structuredClone(fila) : null;
  }

  async listar(): Promise<{ items: ConversacionListada[]; total: number }> {
    throw new Error('no requerido en este fake');
  }

  async vincular(
    id: number,
    datos: { empresaId: number; contactoId: number; estado?: string },
  ): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) return null;
    fila.empresaId = datos.empresaId;
    fila.contactoId = datos.contactoId;
    if (datos.estado !== undefined) fila.estado = datos.estado as ConversacionCrm['estado'];
    fila.actualizadoEn = new Date().toISOString();
    this.vinculaciones.push(structuredClone({ id, datos }));
    return structuredClone(fila);
  }

  async actualizarEstado(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async marcarMensajesLeidos(): Promise<void> {
    throw new Error('no requerido en este fake');
  }

  async registrarActividad(): Promise<void> {
    throw new Error('no requerido en este fake');
  }

  async buscarCandidatosVinculacion(): Promise<CandidatoVinculacion[]> {
    throw new Error('no requerido en este fake');
  }

  async crearContacto(empresaId: number, datos: { nombre: string; cargo?: string | null }): Promise<{ contactoId: number }> {
    // Mirrors the SQL adapter: nombre normalizado es derivado, nunca
    // confiado; el INSERT devuelve el identity.
    const contactoId = this.siguienteContactoId++;
    this.contactosCreados.push({ empresaId, nombre: normalizarNombre(datos.nombre), cargo: datos.cargo ?? null });
    this.contactos.push({
      contactoId,
      empresaId,
      nombre: datos.nombre,
      cargo: datos.cargo ?? null,
      razonSocial: null,
    });
    return { contactoId };
  }

  async obtenerContactoPorId(contactoId: number): Promise<ContactoConEmpresa | null> {
    const contacto = this.contactos.find((c) => c.contactoId === contactoId);
    return contacto
      ? {
          contactoId: contacto.contactoId,
          empresaId: contacto.empresaId,
          nombreContacto: contacto.nombre,
          razonSocial: contacto.razonSocial,
          telefono: null,
        }
      : null;
  }

  modosActualizados: Array<{ id: number; modo: ModoConversacion }> = [];

  async actualizarModo(id: number, modo: ModoConversacion): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) return null;
    fila.modo = modo;
    fila.actualizadoEn = new Date().toISOString();
    this.modosActualizados.push({ id, modo });
    return structuredClone(fila);
  }
}

class FakeMensajes implements MensajeCrmRepository {
  filas: MensajeCrm[] = [];
  consultas: number[] = [];
  private siguienteId = 1;

  /** Seeds a thread row; defaults emulate an IN/CLIENTE text (hilo real). */
  sembrar(
    conversacionId: number,
    sobres: Partial<Pick<MensajeCrm, 'direccion' | 'emisor' | 'cuerpo'>> = {},
  ): MensajeCrm {
    const fila: MensajeCrm = {
      id: this.siguienteId++,
      conversacionId,
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'hola, necesito info',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: null,
      idempotenciaKey: null,
      estadoEnvio: null,
      fuentes: null,
      score: null,
      modelo: null,
      creadoEn: new Date().toISOString(),
      ...sobres,
    };
    this.filas.push(fila);
    return fila;
  }

  async crear(): Promise<MensajeCrm> {
    throw new Error('no requerido en este fake');
  }

  async actualizarEnvio(): Promise<MensajeCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async existePorIdempotenciaKey(): Promise<boolean> {
    throw new Error('no requerido en este fake');
  }

  /** Mirrors the SQL adapter: newest-first (id DESC) with the antesDeId cursor. */
  async listarPorConversacion(
    conversacionId: number,
    opciones: { limite: number; antesDeId?: number },
  ): Promise<MensajeCrm[]> {
    this.consultas.push(conversacionId);
    return this.filas
      .filter((f) => f.conversacionId === conversacionId)
      .filter((f) => opciones.antesDeId === undefined || f.id < opciones.antesDeId)
      .sort((a, b) => b.id - a.id)
      .slice(0, opciones.limite);
  }
}

class FakeTareas implements TareaAgenteRepository {
  creaciones: Array<{ conversacionId: number; mensajeId: number; tipo: 'GENERAR_RESPUESTA' }> = [];
  private filas = new Map<string, number>();
  private siguienteId = 1;

  async crearSiNoExiste(entrada: {
    conversacionId: number;
    mensajeId: number;
    tipo: 'GENERAR_RESPUESTA';
  }): Promise<{ id: number; creada: boolean }> {
    this.creaciones.push({ ...entrada });
    const clave = `${entrada.conversacionId}:${entrada.mensajeId}:${entrada.tipo}`;
    const existente = this.filas.get(clave);
    if (existente !== undefined) return { id: existente, creada: false };
    const id = this.siguienteId++;
    this.filas.set(clave, id);
    return { id, creada: true };
  }

  async reclamarPendientes(): Promise<never[]> { throw new Error('no requerido en este fake'); }
  async reclamarAbandonadas(): Promise<never[]> { throw new Error('no requerido en este fake'); }
  async completar(): Promise<void> { throw new Error('no requerido en este fake'); }
  async reencolar(): Promise<void> { throw new Error('no requerido en este fake'); }
  async fallar(): Promise<void> { throw new Error('no requerido en este fake'); }
}

function conversacionPendiente(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: null,
    contactoId: null,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.1349',
    estado: 'PENDIENTE_VINCULACION',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: ahora,
    noLeidos: 3,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function crearSuite(): {
  fake: FakeConversaciones;
  mensajes: FakeMensajes;
  tareas: FakeTareas;
  useCase: VincularConversacionUseCase;
} {
  const fake = new FakeConversaciones();
  fake.sembrar(conversacionPendiente());
  const mensajes = new FakeMensajes();
  const tareas = new FakeTareas();
  const useCase = new VincularConversacionUseCase({ conversaciones: fake, mensajes, tareas });
  return { fake, mensajes, tareas, useCase };
}

describe('VincularConversacionUseCase — vinculación operador (E1 + E2·T5)', () => {
  it('asociar: resuelve la empresa desde el contacto y vincula con estado ACTIVA_IA + modo IA', async () => {
    const { fake, useCase } = crearSuite();
    fake.sembrarContacto({
      contactoId: 42,
      empresaId: 7,
      nombre: 'Ana Giménez',
      cargo: 'Jefa de compras',
      razonSocial: 'Constructora X',
    });

    const conversacion = await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 42 });

    expect(fake.vinculaciones).toEqual([
      { id: 1, datos: { empresaId: 7, contactoId: 42, estado: 'ACTIVA_IA' } },
    ]);
    expect(fake.modosActualizados).toEqual([{ id: 1, modo: 'IA' }]);
    expect(conversacion).toMatchObject({
      id: 1,
      empresaId: 7,
      contactoId: 42,
      estado: 'ACTIVA_IA',
      razonSocial: 'Constructora X',
      nombreContacto: 'Ana Giménez',
    });
    expect(fake.contactosCreados).toHaveLength(0);
  });

  it('crear: persiste el contacto nuevo primero y vincula con su id', async () => {
    const { fake, useCase } = crearSuite();

    const entrada: VincularConversacionEntrada = {
      conversacionId: 1,
      modo: 'crear',
      nuevoContacto: { empresaId: 9, nombre: 'Beto López', cargo: 'Gerente' },
    };
    const conversacion = await useCase.ejecutar(entrada);

    expect(fake.contactosCreados).toEqual([
      { empresaId: 9, nombre: 'beto lopez', cargo: 'Gerente' },
    ]);
    expect(fake.vinculaciones).toEqual([
      { id: 1, datos: { empresaId: 9, contactoId: 100, estado: 'ACTIVA_IA' } },
    ]);
    expect(conversacion).toMatchObject({ empresaId: 9, contactoId: 100, estado: 'ACTIVA_IA' });
  });

  it('contacto inexistente en modo asociar → CONTACTO_NO_ENCONTRADO', async () => {
    const { fake, useCase } = crearSuite();

    await expect(
      useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 999 }),
    ).rejects.toBeInstanceOf(ContactoNoEncontradoError);
    expect(fake.vinculaciones).toHaveLength(0);
  });

  it('conversación inexistente → CONVERSACION_NO_ENCONTRADA sin crear contacto', async () => {
    const { fake, useCase } = crearSuite();

    await expect(
      useCase.ejecutar({
        conversacionId: 99,
        modo: 'crear',
        nuevoContacto: { empresaId: 9, nombre: 'Beto' },
      }),
    ).rejects.toBeInstanceOf(ConversacionNoEncontradaError);
    expect(fake.contactosCreados).toHaveLength(0);
    expect(fake.vinculaciones).toHaveLength(0);
  });

  it('re-vincular permitido: cambia el contacto de una conversación ya vinculada', async () => {
    const { fake, useCase } = crearSuite();
    fake.sembrarContacto({ contactoId: 42, empresaId: 7, nombre: 'Ana', cargo: null, razonSocial: 'A' });
    fake.sembrarContacto({ contactoId: 43, empresaId: 8, nombre: 'Carla', cargo: null, razonSocial: 'B' });
    fake.filas[0] = conversacionPendiente({ empresaId: 7, contactoId: 42, estado: 'TOMADA_HUMANO' });

    const conversacion = await useCase.ejecutar({
      conversacionId: 1,
      modo: 'asociar',
      contactoId: 43,
    });

    expect(conversacion).toMatchObject({ empresaId: 8, contactoId: 43 });
    expect(fake.vinculaciones).toHaveLength(1);
  });

  it('modo asociar sin contactoId → error de validación tipado', async () => {
    const { fake, useCase } = crearSuite();

    await expect(
      useCase.ejecutar({ conversacionId: 1, modo: 'asociar' } as VincularConversacionEntrada),
    ).rejects.toThrow(/contactoId/);
    expect(fake.vinculaciones).toHaveLength(0);
  });

  it('tras vincular, encola GENERAR_RESPUESTA para el mensaje IN/CLIENTE más reciente', async () => {
    const { fake, mensajes, tareas, useCase } = crearSuite();
    fake.sembrarContacto({ contactoId: 42, empresaId: 7, nombre: 'Ana', cargo: null, razonSocial: 'A' });
    // Hilo: IN del cliente, respuesta IA, y un IN MÁS RECIENTE — la
    // tarea debe apuntar al último IN aunque haya OUT posteriores.
    const primerIn = mensajes.sembrar(1, { cuerpo: 'primer mensaje' });
    mensajes.sembrar(1, { direccion: 'OUT', emisor: 'IA', cuerpo: 'respuesta previa' });
    const ultimoIn = mensajes.sembrar(1, { cuerpo: 'consulta pendiente' });
    mensajes.sembrar(1, { direccion: 'OUT', emisor: 'HUMANO', cuerpo: 'nota del operador' });
    expect(ultimoIn.id).toBeGreaterThan(primerIn.id);

    await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 42 });

    expect(tareas.creaciones).toEqual([
      { conversacionId: 1, mensajeId: ultimoIn.id, tipo: 'GENERAR_RESPUESTA' },
    ]);
  });

  it('conversación sin mensajes IN/CLIENTE → vincula sin encolar tarea', async () => {
    const { fake, mensajes, tareas, useCase } = crearSuite();
    fake.sembrarContacto({ contactoId: 42, empresaId: 7, nombre: 'Ana', cargo: null, razonSocial: 'A' });
    mensajes.sembrar(1, { direccion: 'OUT', emisor: 'HUMANO', cuerpo: 'solo salida' });

    await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 42 });

    expect(mensajes.consultas).toEqual([1]);
    expect(tareas.creaciones).toEqual([]);
  });

  it('sin los deps nuevos (construcción pre-E2 { conversaciones }) → vincula y salta el hook sin romper', async () => {
    const fake = new FakeConversaciones();
    fake.sembrar(conversacionPendiente());
    fake.sembrarContacto({ contactoId: 42, empresaId: 7, nombre: 'Ana', cargo: null, razonSocial: 'A' });
    const useCase = new VincularConversacionUseCase({ conversaciones: fake });

    const conversacion = await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 42 });

    expect(conversacion).toMatchObject({ estado: 'ACTIVA_IA' });
    expect(fake.vinculaciones).toEqual([
      { id: 1, datos: { empresaId: 7, contactoId: 42, estado: 'ACTIVA_IA' } },
    ]);
  });

  it('re-vincular una conversación con tarea existente no duplica (crearSiNoExiste idempotente)', async () => {
    const { fake, mensajes, tareas, useCase } = crearSuite();
    fake.sembrarContacto({ contactoId: 42, empresaId: 7, nombre: 'Ana', cargo: null, razonSocial: 'A' });
    fake.sembrarContacto({ contactoId: 43, empresaId: 8, nombre: 'Carla', cargo: null, razonSocial: 'B' });
    const inPendiente = mensajes.sembrar(1);

    await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 42 });
    await useCase.ejecutar({ conversacionId: 1, modo: 'asociar', contactoId: 43 });

    // Dos vinculaciones (corrección del operador), UNA tarea viva por triple.
    expect(fake.vinculaciones).toHaveLength(2);
    expect(tareas.creaciones).toHaveLength(2);
    expect(new Set(tareas.creaciones.map((c) => `${c.conversacionId}:${c.mensajeId}`))).toEqual(
      new Set([`1:${inPendiente.id}`]),
    );
  });
});
