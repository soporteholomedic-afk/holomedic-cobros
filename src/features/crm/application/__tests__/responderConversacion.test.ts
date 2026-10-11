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
 *   with NO send and NO write on every failure arm; el cuerpo se
 *   normaliza (trim) UNA vez y esa misma variable se valida, envía
 *   y persiste (límite 4000 sobre el valor trimeado).
 * - Outbox-lite (R4): intent persisted PENDIENTE BEFORE the send; envío
 *   ok → confirm ENVIADO (wamid, el resultado devuelve la FILA que
 *   actualizarEnvio retorna, fallback a la pendiente si null) +
 *   registrarActividad('OUT') best-effort (su fallo NO miente con
 *   CONFIRMACION_FALLIDA); envío falla → best-effort FALLIDO + ok:false
 *   (nunca lanza); intent failure propaga sin envío; confirm failure →
 *   CONFIRMACION_FALLIDA.
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  actividades: Array<{ id: number; direccion: 'IN' | 'OUT' }> = [];
  falloActividad: Error | null = null;
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

  /** E2·T5 implicit-take log: the use case flips estado/modo after a
   * successful manual send from ACTIVA_IA / REQUIERE_HUMANO. */
  estadosActualizados: Array<{ id: number; estado: ConversacionCrm['estado'] }> = [];
  modosActualizados: Array<{ id: number; modo: ConversacionCrm['modo'] }> = [];
  falloActualizarEstado: Error | null = null;

  async actualizarEstado(
    id: number,
    estado: ConversacionCrm['estado'],
  ): Promise<ConversacionCrm | null> {
    if (this.falloActualizarEstado !== null) throw this.falloActualizarEstado;
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) return null;
    fila.estado = estado;
    fila.actualizadoEn = new Date().toISOString();
    this.estadosActualizados.push({ id, estado });
    return structuredClone(fila);
  }

  async actualizarModo(id: number, modo: ConversacionCrm['modo']): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) return null;
    fila.modo = modo;
    fila.actualizadoEn = new Date().toISOString();
    this.modosActualizados.push({ id, modo });
    return structuredClone(fila);
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
    if (this.falloActividad !== null) throw this.falloActividad;
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
  /** Presente (aunque sea null) → actualizarEnvio devuelve exactamente eso, sin tocar filas. */
  retornoActualizarEnvio?: MensajeCrm | null;
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
    if (this.retornoActualizarEnvio !== undefined) return this.retornoActualizarEnvio;
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

/** Overrides que acepta la factory — cada test declara su escenario, sin toquetear knobs a mano. */
interface OverridesFakes {
  /** null = sin conversación sembrada (CONVERSACION_NO_ENCONTRADA). */
  conversacion?: ConversacionCrm | null;
  envio?: ResultadoEnvioWhatsapp;
  falloCrear?: Error;
  falloActualizarEnvio?: Error;
  retornoActualizarEnvio?: MensajeCrm | null;
  falloActividad?: Error;
  falloActualizarEstado?: Error;
}

/** Factory única (E1 advisory R2-dup-test-fakes): arma los tres fakes-espía cableados al use case. */
function crearFakes(overrides: OverridesFakes = {}): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  whatsapp: FakeWhatsApp;
  useCase: ResponderConversacionUseCase;
} {
  const conversaciones = new FakeConversaciones();
  if (overrides.conversacion !== null) {
    conversaciones.sembrar(overrides.conversacion === undefined ? conversacionBase() : overrides.conversacion);
  }
  conversaciones.falloActividad = overrides.falloActividad ?? null;
  conversaciones.falloActualizarEstado = overrides.falloActualizarEstado ?? null;
  const mensajes = new FakeMensajes();
  mensajes.falloCrear = overrides.falloCrear ?? null;
  mensajes.falloActualizarEnvio = overrides.falloActualizarEnvio ?? null;
  if (overrides.retornoActualizarEnvio !== undefined) {
    mensajes.retornoActualizarEnvio = overrides.retornoActualizarEnvio;
  }
  const whatsapp = new FakeWhatsApp();
  if (overrides.envio !== undefined) whatsapp.resultado = overrides.envio;
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
    const { mensajes, whatsapp, conversaciones, useCase } = crearFakes();

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

  it('el resultado usa la fila confirmada que actualizarEnvio retorna (no una resíntesis local)', async () => {
    const filaConfirmada: MensajeCrm = {
      id: 1,
      conversacionId: 1,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo: 'Buenas tardes, sí!',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: 'wamid.REPO.CONFIRMADA',
      idempotenciaKey: null,
      estadoEnvio: 'ENVIADO',
      fuentes: null,
      score: null,
      modelo: null,
      creadoEn: '2026-02-02T10:00:00.000Z',
    };
    const { useCase } = crearFakes({ retornoActualizarEnvio: filaConfirmada });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas tardes, sí!' });

    expect(resultado).toEqual({ ok: true, mensaje: filaConfirmada });
  });

  it('actualizarEnvio devuelve null → el resultado cae a la fila PENDIENTE persistida (fallback honesto)', async () => {
    const { useCase } = crearFakes({ retornoActualizarEnvio: null });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado).toEqual({
      ok: true,
      mensaje: expect.objectContaining({ estadoEnvio: 'PENDIENTE', wamid: null }),
    });
  });

  it('registrarActividad falla tras confirmar ENVIADO → ok:true SIN advertencia (la fila SÍ está confirmada) + log', async () => {
    const { mensajes, conversaciones, useCase } = crearFakes({
      falloActividad: new Error('UPDATE actividad rebotó'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado).toEqual({
      ok: true,
      mensaje: expect.objectContaining({ estadoEnvio: 'ENVIADO', wamid: 'wamid.OK1' }),
    });
    expect(mensajes.filas[0]).toMatchObject({ estadoEnvio: 'ENVIADO', wamid: 'wamid.OK1' });
    expect(conversaciones.actividades).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ conversacionId: 1 }),
    );
    errorSpy.mockRestore();
  });

  it('envío falla: persiste igual el mensaje FALLIDO (auditoría) y retorna ok:false sin lanzar', async () => {
    const { mensajes, useCase } = crearFakes({
      envio: { ok: false, error: 'KAPSO_TIMEOUT', detalle: 'timeout tras 10s' },
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Reintento' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toEqual({ code: 'KAPSO_TIMEOUT', detalle: 'timeout tras 10s' });
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0]).toMatchObject({ direccion: 'OUT', estadoEnvio: 'PENDIENTE' });
    expect(mensajes.filas[0]).toMatchObject({ estadoEnvio: 'FALLIDO', wamid: null });
  });

  it('fallo al persistir la intención → no envía nada y el error propaga (sin duplicado posible)', async () => {
    const { mensajes, whatsapp, useCase } = crearFakes({ falloCrear: new Error('INSERT rebotó') });
    await expect(useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' })).rejects.toThrow('INSERT rebotó');
    expect(whatsapp.envios).toHaveLength(0);
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('confirmación falla tras envío exitoso → ok:true + CONFIRMACION_FALLIDA con fila PENDIENTE', async () => {
    const { mensajes, conversaciones, useCase } = crearFakes({
      falloActualizarEnvio: new Error('UPDATE rebotó'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });
    expect(resultado).toMatchObject({ ok: true, advertencia: 'CONFIRMACION_FALLIDA',
      mensaje: { estadoEnvio: 'PENDIENTE', wamid: null } });
    expect(mensajes.filas[0].estadoEnvio).toBe('PENDIENTE');
    // La confirmación rebotó ANTES de tocar la actividad: nada que registrar.
    expect(conversaciones.actividades).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mensajeId: 1, wamid: 'wamid.OK1' }));
    errorSpy.mockRestore();
  });

  it('el fallo del best-effort FALLIDO no enmascara el error original del envío', async () => {
    const { mensajes, useCase } = crearFakes({
      envio: { ok: false, error: 'KAPSO_ERROR', detalle: '5xx del canal' },
      falloActualizarEnvio: new Error('UPDATE rebotó'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });
    expect(esperarError(resultado)).toEqual({ code: 'KAPSO_ERROR', detalle: '5xx del canal' });
    expect(mensajes.filas[0].estadoEnvio).toBe('PENDIENTE');
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mensajeId: 1 }));
    errorSpy.mockRestore();
  });

  it('cuerpo vacío o solo espacios → CUERPO_INVALIDO sin enviar ni persistir', async () => {
    const { mensajes, whatsapp, useCase } = crearFakes();

    const vacio = await useCase.ejecutar({ conversacionId: 1, cuerpo: '   ' });

    expect(vacio.ok).toBe(false);
    expect(esperarError(vacio)).toMatchObject({ code: 'CUERPO_INVALIDO' });
    expect(whatsapp.envios).toHaveLength(0);
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('cuerpo de 4001 caracteres → CUERPO_INVALIDO (límite NVARCHAR(4000))', async () => {
    const { mensajes, useCase } = crearFakes();

    const largo = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'a'.repeat(4001) });

    expect(largo.ok).toBe(false);
    expect(esperarError(largo)).toMatchObject({ code: 'CUERPO_INVALIDO' });
    expect(mensajes.escritas).toHaveLength(0);
  });

  it('cuerpo de exactamente 4000 caracteres pasa la validación', async () => {
    const { mensajes, useCase } = crearFakes();

    const limite = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'a'.repeat(4000) });

    expect(limite.ok).toBe(true);
    expect(mensajes.escritas).toHaveLength(1);
  });

  it('4000 + espacios alrededor → el largo se mide sobre el valor TRIMEADO (una sola normalización)', async () => {
    const { mensajes, whatsapp, useCase } = crearFakes();

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: `  ${'a'.repeat(4000)}  ` });

    expect(resultado.ok).toBe(true);
    expect(mensajes.escritas).toHaveLength(1);
    expect(mensajes.escritas[0].cuerpo).toBe('a'.repeat(4000));
    expect(whatsapp.envios).toEqual([
      { telefonoE164: '+595981234567', cuerpo: 'a'.repeat(4000) },
    ]);
  });

  it('el cuerpo trimeado es el que se envía y persiste (misma variable en todo el flujo)', async () => {
    const { mensajes, whatsapp, useCase } = crearFakes();

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: '  Hola  ' });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.mensaje.cuerpo).toBe('Hola');
    expect(mensajes.escritas[0].cuerpo).toBe('Hola');
    expect(whatsapp.envios).toEqual([{ telefonoE164: '+595981234567', cuerpo: 'Hola' }]);
  });

  it('conversación sin teléfono → SIN_TELEFONO sin enviar', async () => {
    const { whatsapp, useCase } = crearFakes({
      conversacion: conversacionBase({ telefono: null, identificadorCanal: null }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'SIN_TELEFONO' });
    expect(whatsapp.envios).toHaveLength(0);
  });

  it('conversación inexistente → CONVERSACION_NO_ENCONTRADA', async () => {
    const { useCase } = crearFakes({ conversacion: null });

    const resultado = await useCase.ejecutar({ conversacionId: 99, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'CONVERSACION_NO_ENCONTRADA' });
  });

  it('conversación CERRADA → CONVERSACION_CERRADA sin enviar ni persistir', async () => {
    const { mensajes, whatsapp, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'CERRADA' }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Hola' });

    expect(resultado.ok).toBe(false);
    expect(esperarError(resultado)).toMatchObject({ code: 'CONVERSACION_CERRADA' });
    expect(whatsapp.envios).toHaveLength(0);
    expect(mensajes.escritas).toHaveLength(0);
  });

  // ---- E2·T5: toma implícita del humano ----

  it('respuesta manual desde ACTIVA_IA → tras el envío exitoso pasa a TOMADA_HUMANO + modo HUMANO', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'ACTIVA_IA', modo: 'IA', asignadaA: null }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado.ok).toBe(true);
    expect(conversaciones.estadosActualizados).toEqual([{ id: 1, estado: 'TOMADA_HUMANO' }]);
    expect(conversaciones.modosActualizados).toEqual([{ id: 1, modo: 'HUMANO' }]);
    expect(conversaciones.filas[0]).toMatchObject({ estado: 'TOMADA_HUMANO', modo: 'HUMANO' });
  });

  it('respuesta manual desde REQUIERE_HUMANO → TOMADA_HUMANO tras el envío exitoso', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'REQUIERE_HUMANO', modo: 'IA' }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado.ok).toBe(true);
    expect(conversaciones.estadosActualizados).toEqual([{ id: 1, estado: 'TOMADA_HUMANO' }]);
    expect(conversaciones.modosActualizados).toEqual([{ id: 1, modo: 'HUMANO' }]);
  });

  it('respuesta manual desde TOMADA_HUMANO → estado y modo quedan intactos (sin flip)', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'TOMADA_HUMANO', modo: 'HUMANO', asignadaA: 'operador' }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado.ok).toBe(true);
    expect(conversaciones.estadosActualizados).toEqual([]);
    expect(conversaciones.modosActualizados).toEqual([]);
    expect(conversaciones.filas[0]).toMatchObject({ estado: 'TOMADA_HUMANO', modo: 'HUMANO' });
  });

  it('respuesta manual desde PAUSADA → estado queda PAUSADA (sin flip)', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'PAUSADA', modo: 'IA' }),
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado.ok).toBe(true);
    expect(conversaciones.estadosActualizados).toEqual([]);
    expect(conversaciones.filas[0].estado).toBe('PAUSADA');
  });

  it('envío FALLA desde ACTIVA_IA → estado y modo quedan intactos (la toma es solo tras éxito)', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'ACTIVA_IA', modo: 'IA', asignadaA: null }),
      envio: { ok: false, error: 'KAPSO_TIMEOUT', detalle: 'timeout' },
    });

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado.ok).toBe(false);
    expect(conversaciones.estadosActualizados).toEqual([]);
    expect(conversaciones.modosActualizados).toEqual([]);
    expect(conversaciones.filas[0]).toMatchObject({ estado: 'ACTIVA_IA', modo: 'IA' });
  });

  it('el flip de toma implícita es best-effort: su fallo se loguea y NO rompe el ok:true', async () => {
    const { conversaciones, useCase } = crearFakes({
      conversacion: conversacionBase({ estado: 'ACTIVA_IA', modo: 'IA', asignadaA: null }),
      falloActualizarEstado: new Error('UPDATE estado rebotó'),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resultado = await useCase.ejecutar({ conversacionId: 1, cuerpo: 'Buenas' });

    expect(resultado).toMatchObject({ ok: true });
    expect(conversaciones.modosActualizados).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ conversacionId: 1 }),
    );
    errorSpy.mockRestore();
  });
});
