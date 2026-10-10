import { describe, expect, it } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  MensajeCrmRepository,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  CrearConversacionInput,
  CrearMensajeInput,
  MensajeCrm,
} from '../../domain/entities';
import { normalizarTelefonoE164, telefonoDigitosClave } from '../../domain/normalizar';
import { ProcesarMensajeWhatsappUseCase, type MensajeEntranteWhatsapp } from '../procesarMensajeWhatsapp';

/**
 * Use-case contract for the inbound WhatsApp pipeline (agente-ia-crm
 * T2). Hexagonal: exercised against the PORTS with in-memory fakes —
 * the SQL adapters stay thin. Pinned here:
 * - Idempotencia: a repeated idempotenciaKey returns duplicado:true
 *   EARLY (no conversation lookup, no write).
 * - Routing: existing conversation by canal key is REUSED; a new one
 *   is born PENDIENTE_VINCULACION — unless exactly ONE candidate
 *   contacto matches the E.164, then it is born vinculado
 *   TOMADA_HUMANO; 0 or >1 candidates never autovinculate.
 * - BSUID-less payloads (no from / from_user_id) still process, with
 *   telefono and identificadorCanal both null.
 * - Message body: text → verbatim TEXTO; any other type → `[type]`
 *   MEDIA. IN/CLIENTE/WHATSAPP with wamid + idempotenciaKey.
 * - registrarActividad advances ultimoMensajeEn and noLeidos.
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

  async listar(): Promise<ConversacionCrm[]> {
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

  /**
   * Mirrors the SQL adapter contract: candidates whose free-text phone
   * normalizes to the SAME digit key as the incoming E.164.
   */
  async buscarCandidatosVinculacion(telefonoE164: string): Promise<CandidatoVinculacion[]> {
    const claveEntrante = telefonoDigitosClave(telefonoE164);
    return this.candidatos.filter((c) => {
      const e164 = normalizarTelefonoE164(c.telefono);
      return e164 !== null && telefonoDigitosClave(e164) === claveEntrante;
    });
  }

  async registrarActividad(id: number): Promise<void> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) throw new Error(`conversación ${id} inexistente en el fake`);
    fila.ultimoMensajeEn = new Date().toISOString();
    fila.noLeidos += 1;
    fila.actualizadoEn = fila.ultimoMensajeEn;
  }
}

class FakeMensajes implements MensajeCrmRepository {
  escritas: CrearMensajeInput[] = [];
  clavesExistentes = new Set<string>();
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
    if (fila.idempotenciaKey !== null) this.clavesExistentes.add(fila.idempotenciaKey);
    return fila;
  }

  async existePorIdempotenciaKey(key: string): Promise<boolean> {
    return this.clavesExistentes.has(key);
  }

  async listarPorConversacion(): Promise<MensajeCrm[]> {
    throw new Error('no requerido en este fake');
  }
}

function eventoTexto(sobres: Partial<MensajeEntranteWhatsapp['message']> = {}, key = 'uuid-1'): MensajeEntranteWhatsapp {
  return {
    idempotenciaKey: key,
    message: {
      id: 'wamid.123',
      timestamp: '1730092800',
      type: 'text',
      from: '595981234567',
      from_user_id: 'US.13491208655302741918',
      text: { body: 'Hola, quiero información' },
      ...sobres,
    },
  };
}

function crearSuite(candidatos: CandidatoVinculacion[] = []): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  useCase: ProcesarMensajeWhatsappUseCase;
} {
  const conversaciones = new FakeConversaciones();
  conversaciones.candidatos = candidatos;
  const mensajes = new FakeMensajes();
  const useCase = new ProcesarMensajeWhatsappUseCase({ conversaciones, mensajes });
  return { conversaciones, mensajes, useCase };
}

const candidatoUnico: CandidatoVinculacion = {
  empresaId: 7,
  contactoId: 42,
  nombreContacto: 'Ana Giménez',
  razonSocial: 'Constructora X',
  telefono: '0981 234 567',
};

describe('ProcesarMensajeWhatsappUseCase — ingesta whatsapp.message.received (T2)', () => {
  it('happy path texto: crea conversación PENDIENTE_VINCULACION y mensaje IN/CLIENTE/TEXTO', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();

    const resultado = await useCase.ejecutar(eventoTexto());

    expect(resultado).toEqual({
      conversacionId: 1,
      mensajeId: 1,
      vinculado: false,
      duplicado: false,
    });
    expect(conversaciones.filas).toHaveLength(1);
    expect(conversaciones.filas[0]).toMatchObject({
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      identificadorCanal: 'US.13491208655302741918',
      estado: 'PENDIENTE_VINCULACION',
    });
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({
      conversacionId: 1,
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'Hola, quiero información',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: 'wamid.123',
      idempotenciaKey: 'uuid-1',
      estadoEnvio: null,
    });
  });

  it('sin from ni from_user_id (BSUID): procesa igual con telefono e identificadorCanal null', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();

    const resultado = await useCase.ejecutar(
      eventoTexto({ from: undefined, from_user_id: undefined, text: undefined, type: 'text' }),
    );

    expect(resultado.duplicado).toBe(false);
    expect(conversaciones.filas).toHaveLength(1);
    expect(conversaciones.filas[0]).toMatchObject({
      telefono: null,
      identificadorCanal: null,
      estado: 'PENDIENTE_VINCULACION',
    });
    // type text sin body → cuerpo '[text]', tipo MEDIA
    expect(mensajes.escritas[0]).toMatchObject({ cuerpo: '[text]', tipo: 'MEDIA' });
  });

  it('exactamente 1 candidato → conversación nace vinculada TOMADA_HUMANO (modo HUMANO)', async () => {
    const { conversaciones, useCase } = crearSuite([candidatoUnico]);

    const resultado = await useCase.ejecutar(eventoTexto());

    expect(resultado.vinculado).toBe(true);
    expect(conversaciones.filas).toHaveLength(1);
    expect(conversaciones.filas[0]).toMatchObject({
      empresaId: 7,
      contactoId: 42,
      estado: 'TOMADA_HUMANO',
      asignadaA: null,
    });
  });

  it('más de 1 candidato → NO autovincula: nace PENDIENTE_VINCULACION', async () => {
    const { conversaciones, useCase } = crearSuite([
      candidatoUnico,
      { ...candidatoUnico, contactoId: 43, nombreContacto: 'Beto', telefono: '0981 234 567' },
    ]);

    const resultado = await useCase.ejecutar(eventoTexto());

    expect(resultado.vinculado).toBe(false);
    expect(conversaciones.filas[0]).toMatchObject({
      empresaId: null,
      contactoId: null,
      estado: 'PENDIENTE_VINCULACION',
    });
  });

  it('idempotenciaKey repetida → duplicado:true early, sin segunda escritura ni lookup', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();
    const evento = eventoTexto();

    const primero = await useCase.ejecutar(evento);
    const segundo = await useCase.ejecutar(evento);

    expect(primero.duplicado).toBe(false);
    expect(segundo).toMatchObject({ duplicado: true, conversacionId: null, mensajeId: null });
    expect(mensajes.escritas).toHaveLength(1);
    expect(conversaciones.filas).toHaveLength(1);
  });

  it('type audio → cuerpo "[audio]" tipo MEDIA', async () => {
    const { mensajes, useCase } = crearSuite();

    await useCase.ejecutar(eventoTexto({ type: 'audio' }));

    expect(mensajes.escritas[0]).toMatchObject({ cuerpo: '[audio]', tipo: 'MEDIA' });
  });

  it('conversación existente por identificadorCanal se reutiliza (no crea otra)', async () => {
    const { conversaciones, mensajes, useCase } = crearSuite();
    // Primer mensaje SIN teléfono (solo BSUID) → conversación keyed por
    // identificadorCanal (telefono null).
    await useCase.ejecutar(eventoTexto({ from: undefined }, 'uuid-a'));
    expect(conversaciones.filas).toHaveLength(1);

    // Segundo mensaje del MISMO from_user_id, ahora con teléfono: la
    // búsqueda principal (telefono) no matchea la fila existente y el
    // fallback por identificadorCanal debe reutilizarla — nunca una
    // segunda conversación para el mismo hilo.
    const resultado = await useCase.ejecutar(eventoTexto({ from: '595981234567' }, 'uuid-b'));

    expect(conversaciones.filas).toHaveLength(1);
    expect(mensajes.escritas).toHaveLength(2);
    expect(resultado.conversacionId).toBe(conversaciones.filas[0].id);
    // La fila reutilizada NO se re-keya con el teléfono en E1: la
    // vista de vinculación (T5) es quien corrige la clave.
    expect(conversaciones.filas[0].telefono).toBeNull();
  });

  it('registrarActividad avanza ultimoMensajeEn y noLeidos de la conversación usada', async () => {
    const { conversaciones, useCase } = crearSuite();

    // Mismo from_user_id (sin from): ambos mensajes rutean a la MISMA
    // conversación y el contador acumula.
    await useCase.ejecutar(eventoTexto({ from: undefined }, 'uuid-1'));
    await useCase.ejecutar(eventoTexto({ from: undefined }, 'uuid-2'));

    expect(conversaciones.filas).toHaveLength(1);
    const fila = conversaciones.filas[0];
    expect(fila.noLeidos).toBe(2);
    expect(fila.ultimoMensajeEn).not.toBeNull();
  });
});
