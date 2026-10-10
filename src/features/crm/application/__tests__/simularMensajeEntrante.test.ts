import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  ContactoConEmpresa,
  MensajeCrmRepository,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  CrearMensajeInput,
  MensajeCrm,
} from '../../domain/entities';
import { ProcesarMensajeWhatsappUseCase } from '../procesarMensajeWhatsapp';
import {
  SimularMensajeEntranteUseCase,
  SimulacionDesactivadaError,
} from '../simularMensajeEntrante';

/**
 * Use-case contract for the E1 inbound simulator (agente-ia-crm E1,
 * "Simulación Kapso"): while Kapso is not configured, this use case
 * synthesizes the SAME `whatsapp.message.received` event the webhook
 * receives and delegates to the REAL ProcesarMensajeWhatsappUseCase
 * (ingesta → vinculación → bandeja with zero code duplication).
 * Pinned:
 * - Guard: KAPSO_MODO === 'real' REJECTS (SIMULACION_DESACTIVADA) —
 *   the simulator must be impossible in production.
 * - Telefono invalid (unparsable) → ValidationError; valid local PY
 *   free text is normalized to E.164 first.
 * - Happy path: delegates with `from` = digits sin '+' ('0981 234 567'
 *   → '595981234567'), wamid `sim.wamid.*`, idempotenciaKey `sim.*` —
 *   the pipeline stores the IN mensaje and ticks the bandeja.
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  candidatos: CandidatoVinculacion[] = [];
  private siguienteId = 1;

  async crear(datos: CrearConversacionInput): Promise<ConversacionCrm> {
    const ahora = new Date().toISOString();
    const fila: ConversacionCrm = {
      id: this.siguienteId++,
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
      creadoEn: ahora,
      actualizadoEn: ahora,
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

  async vincular(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async actualizarEstado(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async marcarMensajesLeidos(): Promise<void> {
    throw new Error('no requerido en este fake');
  }

  async registrarActividad(id: number): Promise<void> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) throw new Error(`conversación ${id} inexistente en el fake`);
    const ahora = new Date().toISOString();
    fila.ultimoMensajeEn = ahora;
    fila.noLeidos += 1;
    fila.actualizadoEn = ahora;
  }

  async buscarCandidatosVinculacion(): Promise<CandidatoVinculacion[]> {
    return this.candidatos;
  }

  async crearContacto(): Promise<{ contactoId: number }> {
    throw new Error('no requerido en este fake');
  }

  async obtenerContactoPorId(): Promise<ContactoConEmpresa | null> {
    throw new Error('no requerido en este fake');
  }
}

class FakeMensajes implements MensajeCrmRepository {
  escritas: CrearMensajeInput[] = [];
  private siguienteId = 1;

  async crear(datos: CrearMensajeInput): Promise<MensajeCrm> {
    const fila: MensajeCrm = {
      id: this.siguienteId++,
      conversacionId: datos.conversacionId,
      direccion: datos.direccion,
      emisor: datos.emisor,
      cuerpo: datos.cuerpo,
      tipo: datos.tipo ?? 'TEXTO',
      canal: datos.canal ?? 'WHATSAPP',
      wamid: datos.wamid ?? null,
      idempotenciaKey: datos.idempotenciaKey ?? null,
      estadoEnvio: datos.estadoEnvio ?? null,
      fuentes: null,
      score: null,
      modelo: null,
      creadoEn: new Date().toISOString(),
    };
    this.escritas.push(structuredClone(datos));
    return fila;
  }

  async existePorIdempotenciaKey(): Promise<boolean> {
    return false;
  }

  async listarPorConversacion(): Promise<MensajeCrm[]> {
    throw new Error('no requerido en este fake');
  }
}

function crearSuite(): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  useCase: SimularMensajeEntranteUseCase;
} {
  const conversaciones = new FakeConversaciones();
  const mensajes = new FakeMensajes();
  const procesar = new ProcesarMensajeWhatsappUseCase({ conversaciones, mensajes });
  const useCase = new SimularMensajeEntranteUseCase({ procesar });
  return { conversaciones, mensajes, useCase };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SimularMensajeEntranteUseCase — simulador de entrada (E1)', () => {
  it('KAPSO_MODO=real RECHAZA con SIMULACION_DESACTIVADA', async () => {
    vi.stubEnv('KAPSO_MODO', 'real');
    const { conversaciones, useCase } = crearSuite();

    await expect(useCase.ejecutar({ telefono: '0981 234 567', texto: 'hola' })).rejects.toBeInstanceOf(
      SimulacionDesactivadaError,
    );
    expect(conversaciones.filas).toHaveLength(0);
  });

  it('teléfono no parseable → ValidationError, sin delegar', async () => {
    const { conversaciones, useCase } = crearSuite();

    await expect(useCase.ejecutar({ telefono: 'no-es-un-telefono', texto: 'hola' })).rejects.toThrow(
      /teléfono/i,
    );
    expect(conversaciones.filas).toHaveLength(0);
  });

  it('happy path: delega en el pipeline real con from normalizado sin "+"', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();

    const resultado = await useCase.ejecutar({ telefono: '0981 234 567', texto: 'Hola, necesito info' });

    // La conversación nace keyeada por el E.164 normalizado.
    expect(resultado).toMatchObject({ conversacionId: 1, vinculado: false });
    expect(typeof resultado.mensajeId).toBe('number');
    expect(conversaciones.filas).toHaveLength(1);
    expect(conversaciones.filas[0]).toMatchObject({
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      estado: 'PENDIENTE_VINCULACION',
    });
    // El mensaje IN llegó al pipeline con wamid sim.wamid.* y clave sim.*.
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'Hola, necesito info',
      tipo: 'TEXTO',
    });
    expect(mensajes.escritas[0].wamid).toMatch(/^sim\.wamid\./);
    expect(mensajes.escritas[0].idempotenciaKey).toMatch(/^sim\./);
    // Bandeja tick: noLeidos avanzó.
    expect(conversaciones.filas[0].noLeidos).toBe(1);
  });

  it('segundo mensaje del mismo teléfono reutiliza la conversación (mismo pipeline)', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();

    const primera = await useCase.ejecutar({ telefono: '0981 234 567', texto: 'uno' });
    const segunda = await useCase.ejecutar({ telefono: '+595 981 234 567', texto: 'dos' });

    expect(conversaciones.filas).toHaveLength(1);
    expect(primera.conversacionId).toBe(segunda.conversacionId);
    expect(mensajes.escritas).toHaveLength(2);
    expect(conversaciones.filas[0].noLeidos).toBe(2);
  });
});
