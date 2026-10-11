import { describe, expect, it, vi } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  ContactoConEmpresa,
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  MensajeCrmRepository,
  ResultadoEnvioWhatsapp,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  CrearMensajeInput,
  MensajeCrm,
} from '../../domain/entities';
import {
  ResponderConversacionUseCase,
  type ResultadoResponderConversacion,
} from '../responderConversacion';

/**
 * Use-case contract for the manual WhatsApp reply (agente-ia-crm E1).
 * Hexagonal: exercised against the PORTS with in-memory fakes — the
 * SQL adapters and the Kapso SDK stay thin. Pinned here:
 * - Validation order (cuerpo → conversación → cerrada → teléfono)
 *   with NO send and NO write on every failure arm.
 * - Outbox-lite (R4): intent persisted PENDIENTE BEFORE the send; envío
 *   ok → confirm ENVIADO (wamid) + registrarActividad('OUT') (noLeidos
 *   does NOT grow); envío falla → best-effort FALLIDO + ok:false (nunca
 *   lanza); intent failure propaga sin envío; confirm failure → CONFIRMACION_FALLIDA.
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  actividades: Array<{ id: number; direccion: 'IN' | 'OUT' }> = [];
  private siguienteId = 1;

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  private siguiente(): number {
    return this.siguienteId++;
  }

  async crear(datos: CrearConversacionInput): Promise<ConversacionCrm> {
    const fila: ConversacionCrm = {
      id: this.siguiente(),
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

  async vincular(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async actualizarEstado(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async marcarMensajesLeidos(): Promise<void> {
    throw new Error('no requerido en este fake');
  }

  async buscarCandidatosVinculacion(): Promise<CandidatoVinculacion[]> {
    throw new Error('no requerido en este fake');
  }

  async crearContacto(): Promise<{ contactoId: number }> {
    throw new Error('no requerido en este fake');
  }

  async obtenerContactoPorId(): Promise<ContactoConEmpresa | null> {
    throw new Error('no requerido en este fake');
  }

  async registrarActividad(id: number, direccion: 'IN' | 'OUT' = 'IN'): Promise<void> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) throw new Error(`conversación ${id} inexistente en el fake`);
    const ahora = new Date().toISOString();
    fila.ultimoMensajeEn = ahora;
    if (direccion === 'IN') fila.noLeidos += 1;
    fila.actualizadoEn = ahora;
    this.actividades.push({ id, direccion });
  }
}

class FakeMensajes implements MensajeCrmRepository {
  escritas: CrearMensajeInput[] = [];
  filas: MensajeCrm[] = [];
  falloCrear: Error | null = null;
  falloActualizarEnvio: Error | null = null;
  private siguienteId = 1;

  async crear(datos: CrearMensajeInput): Promise<MensajeCrm> {
    if (this.falloCrear !== null) throw this.falloCrear;
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
    this.filas.push(fila);
    return fila;
  }

  async actualizarEnvio(
    id: number,
    datos: { estadoEnvio: 'ENVIADO' | 'FALLIDO'; wamid?: string | null },
  ): Promise<MensajeCrm | null> {
    if (this.falloActualizarEnvio !== null) throw this.falloActualizarEnvio;
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    Object.assign(fila, datos);
    return structuredClone(fila);
  }

  async existePorIdempotenciaKey(): Promise<boolean> {
    return false;
  }

  async listarPorConversacion(): Promise<MensajeCrm[]> {
    throw new Error('no requerido en este fake');
  }
}

class FakeWhatsApp implements EnviadorWhatsappCrmPort {
  envios: EnvioWhatsappCrm[] = [];
  resultado: ResultadoEnvioWhatsapp = { ok: true, wamid: 'wamid.OK1' };

  async enviar(datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp> {
    this.envios.push(structuredClone(datos));
    return structuredClone(this.resultado);
  }
}

function conversacionBase(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: 7,
    contactoId: 42,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.1349',
    estado: 'TOMADA_HUMANO',
    asignadaA: 'operador',
    modo: 'HUMANO',
    ultimoMensajeEn: ahora,
    noLeidos: 2,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function crearSuite(conversacion: ConversacionCrm | null = conversacionBase()): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  whatsapp: FakeWhatsApp;
  useCase: ResponderConversacionUseCase;
} {
  const conversaciones = new FakeConversaciones();
  if (conversacion !== null) conversaciones.sembrar(conversacion);
  const mensajes = new FakeMensajes();
  const whatsapp = new FakeWhatsApp();
  const useCase = new ResponderConversacionUseCase({ conversaciones, mensajes, whatsapp });
  return { conversaciones, mensajes, whatsapp, useCase };
}

function esperarError(
  resultado: ResultadoResponderConversacion,
): { code: string; detalle?: string } {
  if (resultado.ok) throw new Error('se esperaba resultado fallido');
  return resultado.error;
}

describe('ResponderConversacionUseCase — respuesta manual por WhatsApp (E1)', () => {
  it('envío ok: persiste OUT/HUMANO/TEXTO/ENVIADO con wamid y registra actividad OUT', async () => {
    const { mensajes, whatsapp, conversaciones, useCase } = crearSuite();

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas tardes, sí!' });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.mensaje).toMatchObject({
      conversacionId: 1,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo: 'Buenas tardes, sí!',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: 'wamid.OK1',
      estadoEnvio: 'ENVIADO',
    });
    expect(whatsapp.envios).toEqual([
      { telefonoE164: '+595981234567', cuerpo: 'Buenas tardes, sí!' },
    ]);
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({ estadoEnvio: 'PENDIENTE', wamid: null });
    expect(mensajes.filas[0]).toMatchObject({ estadoEnvio: 'ENVIADO', wamid: 'wamid.OK1' });
    // Actividad OUT: avanza ultimoMensajeEn pero NO incrementa noLeidos.
    expect(conversaciones.actividades).toEqual([{ id: 1, direccion: 'OUT' }]);
    expect(conversaciones.filas[0].noLeidos).toBe(2);
    expect(conversaciones.filas[0].ultimoMensajeEn).not.toBeNull();
  });

  it('envío falla: persiste igual el mensaje FALLIDO (auditoría) y retorna ok:false sin lanzar', async () => {
    const { mensajes, whatsapp, useCase } = crearSuite();
    whatsapp.resultado = { ok: false, error: 'KAPSO_TIMEOUT', detalle: 'timeout tras 10s' };

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Reintento' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toEqual({ code: 'KAPSO_TIMEOUT', detalle: 'timeout tras 10s' });
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({ direccion: 'OUT', estadoEnvio: 'PENDIENTE' });
    expect(mensajes.filas[0]).toMatchObject({ estadoEnvio: 'FALLIDO', wamid: null });
  });

  it('fallo al persistir la intención → no envía nada y el error propaga (sin duplicado posible)', async () => {
    const { mensajes, whatsapp, useCase } = crearSuite();
    mensajes.falloCrear = new Error('INSERT rebotó');
    await expect(useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' })).rejects.toThrow('INSERT rebotó');
    expect(whatsapp.envios).toHaveLength(0);
  });

  it('confirmación falla tras envío exitoso → ok:true + CONFIRMACION_FALLIDA con fila PENDIENTE', async () => {
    const { mensajes, useCase } = crearSuite();
    mensajes.falloActualizarEnvio = new Error('UPDATE rebotó');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });
    expect(resultado).toMatchObject({ ok: true, advertencia: 'CONFIRMACION_FALLIDA',
      mensaje: { estadoEnvio: 'PENDIENTE', wamid: null } });
    expect(mensajes.filas[0].estadoEnvio).toBe('PENDIENTE');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mensajeId: 1, wamid: 'wamid.OK1' }));
  });

  it('el fallo del best-effort FALLIDO no enmascara el error original del envío', async () => {
    const { mensajes, whatsapp, useCase } = crearSuite();
    whatsapp.resultado = { ok: false, error: 'KAPSO_ERROR', detalle: '5xx del canal' };
    mensajes.falloActualizarEnvio = new Error('UPDATE rebotó');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });
    expect(esperarError(resultado)).toEqual({ code: 'KAPSO_ERROR', detalle: '5xx del canal' });
    expect(mensajes.filas[0].estadoEnvio).toBe('PENDIENTE');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mensajeId: 1 }));
  });

  it('cuerpo vacío o solo espacios → CUERPO_INVALIDO sin enviar ni persistir', async () => {
    const { mensajes, whatsapp, useCase } = crearSuite();

    const vacio = await useCase.ejecutar({ conversacionId: 1, cuerpo: '   ' });

    expect(vacio.ok).toBe(false);
    expect(esperarError(vacio)).toMatchObject({ code: 'CUERPO_INVALIDO' });
    expect(whatsapp.envios).toHaveLength(0);
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('cuerpo de 4001 caracteres → CUERPO_INVALIDO (límite NVARCHAR(4000))', async () => {
    const { mensajes, useCase } = crearSuite();

    const largo = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'a'.repeat(4001) });

    expect(largo.ok).toBe(false);
    expect(esperarError(largo)).toMatchObject({ code: 'CUERPO_INVALIDO' });
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('cuerpo de exactamente 4000 caracteres pasa la validación', async () => {
    const { mensajes, useCase } = crearSuite();

    const limite = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'a'.repeat(4000) });

    expect(limite.ok).toBe(true);
    expect(mensajes.escritas).toHaveLength(1);
  });

  it('conversación sin teléfono → SIN_TELEFONO sin enviar', async () => {
    const { whatsapp, useCase } = crearSuite(
      conversacionBase({ telefono: null, identificadorCanal: null }),
    );

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'SIN_TELEFONO' });
    expect(whatsapp.envios).toHaveLength(0);
  });

  it('conversación inexistente → CONVERSACION_NO_ENCONTRADA', async () => {
    const { useCase } = crearSuite(null);

    const resultado = await useCase.ejecutar({ conversacionId: 99, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'CONVERSACION_NO_ENCONTRADA' });
  });

  it('conversación CERRADA → CONVERSACION_CERRADA sin enviar ni persistir', async () => {
    const { mensajes, whatsapp, useCase } = crearSuite(conversacionBase({ estado: 'CERRADA' }));

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'CONVERSACION_CERRADA' });
    expect(whatsapp.envios).toHaveLength(0);
    expect(mensajes.escritas).toHaveLength(0);
  });
});
