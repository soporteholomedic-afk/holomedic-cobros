import { describe, expect, it } from 'vitest';

import type {
  ConversacionCrm,
  EstadoConversacion,
  MensajeCrm,
  ModoConversacion,
} from '../../domain/entities';
import type { EntradaCrearTareaAgente, ListarMensajesOpciones } from '../../domain/ports';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import { EstadoConversacionInvalidoError } from '../tomarConversacion';
import {
  DevolverConversacionUseCase,
  type DevolverConversacionDeps,
} from '../devolverConversacion';

/**
 * Use-case contract for devolverConversacion (agente-ia-crm E3·T3) —
 * the operator hands the conversation BACK to la Guía: only from
 * TOMADA_HUMANO → ACTIVA_IA + asignadaA NULL + modo 'IA', then the
 * re-encola decision: IF the last IN message has NO later OUT message
 * (mensajes.listarPorConversacion, newest-first window) ONE idempotent
 * GENERAR_RESPUESTA task is created so the unanswered client message
 * does not wait for the next inbound. Typed error on any other estado
 * (EstadoConversacionInvalidoError, route → 409).
 */

class FakeConversacionesDevolver {
  filas: ConversacionCrm[] = [];
  estadosEscritos: EstadoConversacion[] = [];
  asignaciones: Array<{ id: number; asignadaA: string | null; modo: ModoConversacion }> = [];

  sembrar(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
    const ahora = new Date().toISOString();
    const fila: ConversacionCrm = {
      id: 1,
      empresaId: 7,
      contactoId: 42,
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      identificadorCanal: 'US.1349',
      estado: 'TOMADA_HUMANO',
      asignadaA: 'juana',
      modo: 'HUMANO',
      ultimoMensajeEn: ahora,
      noLeidos: 0,
      creadoEn: ahora,
      actualizadoEn: ahora,
      ...sobres,
    };
    this.filas.push(fila);
    return fila;
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async actualizarEstado(id: number, estado: EstadoConversacion): Promise<ConversacionCrm | null> {
    this.estadosEscritos.push(estado);
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.estado = estado;
    return structuredClone(fila);
  }

  async actualizarAsignacion(
    id: number,
    asignadaA: string | null,
    modo: ModoConversacion,
  ): Promise<void> {
    this.asignaciones.push({ id, asignadaA, modo });
    const fila = this.filas.find((f) => f.id === id);
    if (fila !== undefined) {
      fila.asignadaA = asignadaA;
      fila.modo = modo;
    }
  }
}

class FakeMensajesDevolver {
  filas: MensajeCrm[] = [];

  sembrar(sobres: Partial<MensajeCrm>): void {
    this.filas.push({
      id: this.filas.length + 1,
      conversacionId: 1,
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'Hola',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: null,
      idempotenciaKey: null,
      estadoEnvio: null,
      fuentes: null,
      score: null,
      modelo: null,
      creadoEn: '2026-02-02T10:00:00.000Z',
      ...sobres,
    });
  }

  /** Contrato del port: pagina newest-first (id DESC). */
  async listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]> {
    return this.filas
      .filter((f) => f.conversacionId === conversacionId)
      .sort((a, b) => b.id - a.id)
      .slice(0, opciones.limite)
      .map((f) => structuredClone(f));
  }
}

class FakeTareas {
  creadas: EntradaCrearTareaAgente[] = [];

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<{ id: number; creada: boolean }> {
    this.creadas.push({ ...entrada });
    return { id: 900 + this.creadas.length, creada: true };
  }
}

function crearSuite(estado: EstadoConversacion | null = 'TOMADA_HUMANO'): {
  conversaciones: FakeConversacionesDevolver;
  mensajes: FakeMensajesDevolver;
  tareas: FakeTareas;
  useCase: DevolverConversacionUseCase;
} {
  const conversaciones = new FakeConversacionesDevolver();
  if (estado !== null) conversaciones.sembrar({ estado });
  const mensajes = new FakeMensajesDevolver();
  const tareas = new FakeTareas();
  const useCase = new DevolverConversacionUseCase({
    conversaciones: conversaciones as DevolverConversacionDeps['conversaciones'],
    mensajes,
    tareas,
  });
  return { conversaciones, mensajes, tareas, useCase };
}

describe('DevolverConversacionUseCase — devolución a la Guía (E3·T3)', () => {
  it('happy path: ACTIVA_IA + asignadaA null + modo IA; último IN sin OUT posterior → reencolada true con tarea GENERAR_RESPUESTA', async () => {
    const suite = crearSuite();
    suite.mensajes.sembrar({ id: 10, cuerpo: '¿Hacen exámenes los sábados?' });
    suite.mensajes.sembrar({ id: 11, cuerpo: '¿Siguen ahí?' });

    const resultado = await suite.useCase.ejecutar({ conversacionId: 1 });

    expect(resultado).toEqual({ estado: 'ACTIVA_IA', reencolada: true });
    expect(suite.conversaciones.estadosEscritos).toEqual(['ACTIVA_IA']);
    expect(suite.conversaciones.asignaciones).toEqual([{ id: 1, asignadaA: null, modo: 'IA' }]);
    expect(suite.tareas.creadas).toEqual([
      { conversacionId: 1, mensajeId: 11, tipo: 'GENERAR_RESPUESTA' },
    ]);
  });

  it('el último IN ya tiene un OUT posterior → reencolada false, sin tarea (la Guía no repite respuestas)', async () => {
    const suite = crearSuite();
    suite.mensajes.sembrar({ id: 10, cuerpo: '¿Hacen exámenes?' });
    suite.mensajes.sembrar({
      id: 11,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo: 'Sí, los sábados',
      estadoEnvio: 'ENVIADO',
      wamid: 'wamid.A1',
    });

    const resultado = await suite.useCase.ejecutar({ conversacionId: 1 });

    expect(resultado).toEqual({ estado: 'ACTIVA_IA', reencolada: false });
    expect(suite.tareas.creadas).toEqual([]);
    // La devolución igual ocurre: el estado y la asignación se movieron.
    expect(suite.conversaciones.estadosEscritos).toEqual(['ACTIVA_IA']);
    expect(suite.conversaciones.asignaciones).toEqual([{ id: 1, asignadaA: null, modo: 'IA' }]);
  });

  it('sin mensajes IN → reencolada false, sin tarea', async () => {
    const suite = crearSuite();
    suite.mensajes.sembrar({ id: 10, direccion: 'OUT', emisor: 'IA', cuerpo: 'Hola, soy la Guía' });

    const resultado = await suite.useCase.ejecutar({ conversacionId: 1 });

    expect(resultado).toEqual({ estado: 'ACTIVA_IA', reencolada: false });
    expect(suite.tareas.creadas).toEqual([]);
  });

  it.each(['ACTIVA_IA', 'REQUIERE_HUMANO', 'PAUSADA', 'CERRADA', 'PENDIENTE_VINCULACION'] as const)(
    'estado %s → EstadoConversacionInvalidoError tipado (route → 409), sin escrituras',
    async (estado) => {
      const suite = crearSuite(estado);

      await expect(suite.useCase.ejecutar({ conversacionId: 1 })).rejects.toThrow(
        EstadoConversacionInvalidoError,
      );
      expect(suite.conversaciones.estadosEscritos).toEqual([]);
      expect(suite.conversaciones.asignaciones).toEqual([]);
      expect(suite.tareas.creadas).toEqual([]);
    },
  );

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const suite = crearSuite(null);

    await expect(suite.useCase.ejecutar({ conversacionId: 99 })).rejects.toThrow(
      ConversacionNoEncontradaError,
    );
  });
});
