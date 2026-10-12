import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HuecoConocimiento, MensajeCrm } from '../../domain/entities';
import type { ConocimientoCrmRepository, ConversacionCrmRepository, MensajeCrmRepository } from '../../domain/ports';
import { extraerTerminosRecall } from '../recuperarTerminos';
import {
  MarcarRespuestaDeficienteUseCase,
  MensajeNoEncontradoError,
  MensajeYaMarcadoError,
  SinConsultaPreviaError,
} from '../marcarRespuestaDeficiente';

/**
 * Use-case contract for marcarRespuestaDeficiente (agente-ia-crm
 * E4·T5). Hexagonal: exercised against the PORTS with in-memory fakes
 * (aplicarIndicacion test style). Pinned:
 * - Happy path: the IA message must exist, belong to the conversation
 *   and carry emisor IA; the LAST CLIENTE (IN) message BEFORE it in
 *   the hilo becomes the hueco's consulta (trimmed, términos del
 *   prefilter, estado ABIERTO, origenMensajeId), the mensaje flips
 *   deficiente=1 (idempotent write) and the bandeja tick fires
 *   best-effort; the result carries {huecoId, mensajeId}.
 * - MENSAJE_YA_MARCADO (typed 409): a second mark never stacks a
 *   second hueco; the existing hueco id rides the error when the
 *   optional read capability is present, null when it is not.
 * - SIN_CONSULTA_PREVIA (typed 422): an IA message with NO client
 *   message before it (or only AFTER it) cannot be marked.
 * - Typed 404: mensaje inexistente / de otra conversación; typed 400:
 *   mensaje que no es de la IA.
 * - Optional capabilities (E4·T5, crearHueco precedent): a repo
 *   without them fails LOUDLY instead of half-marking.
 * - Actividad best-effort: a registrarActividad failure never fails
 *   the operation (registrarActividad pattern — motor step 11).
 */

const CONVERSACION_ID = 7;

function mensajeDeHilo(
  id: number,
  emisor: MensajeCrm['emisor'],
  direccion: MensajeCrm['direccion'],
  cuerpo: string,
  overrides: Partial<MensajeCrm> = {},
): MensajeCrm {
  return {
    id,
    conversacionId: CONVERSACION_ID,
    direccion,
    emisor,
    cuerpo,
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: null,
    idempotenciaKey: null,
    estadoEnvio: 'ENVIADO',
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn: `2026-10-11T10:0${id % 10}:00.000Z`,
    ...overrides,
  };
}

class FakeMensajesMarcado implements Pick<MensajeCrmRepository, 'listarPorConversacion'> {
  filas: MensajeCrm[] = [];
  marcadas: number[] = [];

  async listarPorConversacion(
    conversacionId: number,
    opciones: { limite: number; antesDeId?: number },
  ): Promise<MensajeCrm[]> {
    const cursor = opciones.antesDeId ?? Number.POSITIVE_INFINITY;
    const propias = this.filas.filter((f) => f.conversacionId === conversacionId && f.id < cursor);
    return [...propias.slice(-opciones.limite)].reverse();
  }

  async obtenerPorId(id: number): Promise<MensajeCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async marcarDeficiente(id: number): Promise<MensajeCrm | null> {
    this.marcadas.push(id);
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.deficiente = true;
    return structuredClone(fila);
  }
}

class FakeHuecosMarcado implements Pick<ConocimientoCrmRepository, 'crearHueco' | 'obtenerHuecoPorMensaje'> {
  huecos: HuecoConocimiento[] = [];
  private siguienteId = 60;

  async crearHueco(entrada: {
    consulta: string;
    terminos: string[];
    origenSolicitudId?: number | null;
    origenMensajeId?: number | null;
    estado?: HuecoConocimiento['estado'];
  }): Promise<HuecoConocimiento> {
    const fila: HuecoConocimiento = {
      id: this.siguienteId++,
      consulta: entrada.consulta,
      terminos: [...entrada.terminos],
      estado: entrada.estado ?? 'ABIERTO',
      origenSolicitudId: entrada.origenSolicitudId ?? null,
      origenMensajeId: entrada.origenMensajeId ?? null,
      creadoEn: new Date(),
    };
    this.huecos.push(fila);
    return structuredClone(fila);
  }

  async obtenerHuecoPorMensaje(mensajeId: number): Promise<HuecoConocimiento | null> {
    const fila = [...this.huecos]
      .reverse()
      .find((h) => h.origenMensajeId === mensajeId);
    return fila ? structuredClone(fila) : null;
  }
}

class FakeConversacionesMarcado implements Pick<ConversacionCrmRepository, 'registrarActividad'> {
  ticks: Array<{ id: number; direccion: 'IN' | 'OUT' | undefined }> = [];
  falloActividad: Error | null = null;

  async registrarActividad(id: number, direccion: 'IN' | 'OUT' = 'IN'): Promise<void> {
    if (this.falloActividad !== null) throw this.falloActividad;
    this.ticks.push({ id, direccion });
  }
}

interface Escenario {
  mensajes: FakeMensajesMarcado;
  huecos: FakeHuecosMarcado;
  conversaciones: FakeConversacionesMarcado;
  useCase: MarcarRespuestaDeficienteUseCase;
}

function crearEscenario(hilo: MensajeCrm[]): Escenario {
  const mensajes = new FakeMensajesMarcado();
  mensajes.filas = [...hilo];
  const huecos = new FakeHuecosMarcado();
  const conversaciones = new FakeConversacionesMarcado();
  const useCase = new MarcarRespuestaDeficienteUseCase({ mensajes, conocimiento: huecos, conversaciones });
  return { mensajes, huecos, conversaciones, useCase };
}

function ejecutar(escenario: Escenario, mensajeId: number): Promise<{ huecoId: number; mensajeId: number }> {
  return escenario.useCase.ejecutar({
    conversacionId: CONVERSACION_ID,
    mensajeId,
    usuarioId: 'u-1',
    usuarioNombre: 'Juana Perez',
  });
}

describe('MarcarRespuestaDeficienteUseCase (E4·T5)', () => {
  let escenario: Escenario;

  beforeEach(() => {
    // Hilo canónico: el cliente pregunta (id 1), la Guía responde (id 2).
    escenario = crearEscenario([
      mensajeDeHilo(1, 'CLIENTE', 'IN', '  ¿Hacen envíos a Encarnación?  '),
      mensajeDeHilo(2, 'IA', 'OUT', 'Sí, hacemos envíos a todo el país.'),
    ]);
  });

  it('happy path: crea el hueco con la consulta del último IN previa (trim + términos) y marca deficiente', async () => {
    const resultado = await ejecutar(escenario, 2);

    expect(resultado).toEqual({ huecoId: 60, mensajeId: 2 });
    expect(escenario.huecos.huecos).toHaveLength(1);
    expect(escenario.huecos.huecos[0]).toMatchObject({
      consulta: '¿Hacen envíos a Encarnación?',
      terminos: extraerTerminosRecall('¿Hacen envíos a Encarnación?'),
      estado: 'ABIERTO',
      origenMensajeId: 2,
      origenSolicitudId: null,
    });
    expect(escenario.mensajes.filas.find((m) => m.id === 2)?.deficiente).toBe(true);
    expect(escenario.conversaciones.ticks).toEqual([{ id: CONVERSACION_ID, direccion: 'OUT' }]);
  });

  it('elige el ÚLTIMO mensaje del cliente antes de la IA (no el primero del hilo)', async () => {
    escenario.mensajes.filas = [
      mensajeDeHilo(1, 'CLIENTE', 'IN', 'primera pregunta'),
      mensajeDeHilo(2, 'IA', 'OUT', 'primera respuesta'),
      mensajeDeHilo(3, 'CLIENTE', 'IN', 'segunda pregunta'),
      mensajeDeHilo(4, 'IA', 'OUT', 'segunda respuesta'),
    ];

    const resultado = await ejecutar(escenario, 4);

    expect(resultado.huecoId).toBe(60);
    expect(escenario.huecos.huecos[0]?.consulta).toBe('segunda pregunta');
  });

  it('menciones MUY viejas (fuera de la primera página) se alcanzan caminando el cursor antesDeId', async () => {
    // 60 mensajes IN viejos + la IA: el IN previo está más allá del límite 50.
    const hilo: MensajeCrm[] = [];
    for (let id = 1; id <= 60; id += 1) {
      hilo.push(mensajeDeHilo(id, 'CLIENTE', 'IN', `pregunta vieja ${id}`));
    }
    hilo.push(mensajeDeHilo(61, 'IA', 'OUT', 'respuesta tardía'));
    const lejano = crearEscenario(hilo);

    const resultado = await ejecutar(lejano, 61);

    expect(resultado.huecoId).toBe(60);
    expect(lejano.huecos.huecos[0]?.consulta).toBe('pregunta vieja 60');
  });

  it('MENSAJE_YA_MARCADO (409): la segunda marca no apila hueco y expone el hueco existente', async () => {
    await ejecutar(escenario, 2);

    await expect(ejecutar(escenario, 2)).rejects.toThrow(MensajeYaMarcadoError);
    await expect(ejecutar(escenario, 2)).rejects.toMatchObject({
      name: 'MensajeYaMarcadoError',
      huecoId: 60,
    });
    expect(escenario.huecos.huecos).toHaveLength(1);
    expect(escenario.mensajes.marcadas).toHaveLength(1);
  });

  it('MENSAJE_YA_MARCADO sin la capacidad obtenerHuecoPorMensaje → huecoId null', async () => {
    const sinLectura = new MarcarRespuestaDeficienteUseCase({
      mensajes: escenario.mensajes,
      conocimiento: { crearHueco: escenario.huecos.crearHueco.bind(escenario.huecos) },
      conversaciones: escenario.conversaciones,
    });
    escenario.mensajes.filas = escenario.mensajes.filas.map((m) =>
      m.id === 2 ? { ...m, deficiente: true } : m,
    );

    await expect(
      sinLectura.ejecutar({
        conversacionId: CONVERSACION_ID,
        mensajeId: 2,
        usuarioId: 'u-1',
      }),
    ).rejects.toMatchObject({ name: 'MensajeYaMarcadoError', huecoId: null });
  });

  it('SIN_CONSULTA_PREVIA (422): la IA respondió sin pregunta previa del cliente → no escribe nada', async () => {
    const soloIa = crearEscenario([mensajeDeHilo(2, 'IA', 'OUT', 'respuesta sin pregunta')]);

    await expect(ejecutar(soloIa, 2)).rejects.toBeInstanceOf(SinConsultaPreviaError);
    expect(soloIa.huecos.huecos).toHaveLength(0);
    expect(soloIa.mensajes.marcadas).toHaveLength(0);
    expect(soloIa.conversaciones.ticks).toHaveLength(0);
  });

  it('SIN_CONSULTA_PREVIA (422): el único IN del hilo es POSTERIOR a la respuesta IA', async () => {
    const invertido = crearEscenario([
      mensajeDeHilo(2, 'IA', 'OUT', 'respuesta primero'),
      mensajeDeHilo(3, 'CLIENTE', 'IN', 'pregunta después'),
    ]);

    await expect(ejecutar(invertido, 2)).rejects.toBeInstanceOf(SinConsultaPreviaError);
    expect(invertido.huecos.huecos).toHaveLength(0);
  });

  it('404: mensaje inexistente', async () => {
    await expect(ejecutar(escenario, 99)).rejects.toBeInstanceOf(MensajeNoEncontradoError);
    expect(escenario.huecos.huecos).toHaveLength(0);
  });

  it('404: el mensaje existe pero pertenece a OTRA conversación', async () => {
    const deOtroHilo = crearEscenario([
      mensajeDeHilo(1, 'CLIENTE', 'IN', 'pregunta', { conversacionId: 8 }),
      mensajeDeHilo(2, 'IA', 'OUT', 'respuesta de otro hilo', { conversacionId: 8 }),
    ]);

    await expect(ejecutar(deOtroHilo, 2)).rejects.toBeInstanceOf(MensajeNoEncontradoError);
    expect(deOtroHilo.huecos.huecos).toHaveLength(0);
  });

  it('400: el mensaje no es de la IA (HUMANO) → no se marca', async () => {
    const humano = crearEscenario([
      mensajeDeHilo(1, 'CLIENTE', 'IN', 'pregunta'),
      mensajeDeHilo(2, 'HUMANO', 'OUT', 'respuesta del operador'),
    ]);

    await expect(ejecutar(humano, 2)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(humano.huecos.huecos).toHaveLength(0);
    expect(humano.mensajes.marcadas).toHaveLength(0);
  });

  it('capacidades E4 ausentes en el repo de mensajes → error RUIDOSO (nunca medio marca)', async () => {
    const sinCapacidad = new MarcarRespuestaDeficienteUseCase({
      mensajes: { listarPorConversacion: escenario.mensajes.listarPorConversacion.bind(escenario.mensajes) },
      conocimiento: escenario.huecos,
      conversaciones: escenario.conversaciones,
    });

    await expect(
      sinCapacidad.ejecutar({ conversacionId: CONVERSACION_ID, mensajeId: 2, usuarioId: 'u-1' }),
    ).rejects.toThrow(/obtenerPorId/);
    expect(escenario.huecos.huecos).toHaveLength(0);
  });

  it('repo de conocimiento sin crearHueco → error RUIDOSO (aplicarIndicacion precedent)', async () => {
    const sinHueco = new MarcarRespuestaDeficienteUseCase({
      mensajes: escenario.mensajes,
      conocimiento: {},
      conversaciones: escenario.conversaciones,
    });

    await expect(
      sinHueco.ejecutar({ conversacionId: CONVERSACION_ID, mensajeId: 2, usuarioId: 'u-1' }),
    ).rejects.toThrow(/crearHueco/);
    expect(escenario.mensajes.marcadas).toHaveLength(0);
  });

  it('la actividad es best-effort: un fallo del tick no falla la marca', async () => {
    escenario.conversaciones.falloActividad = new Error('tick caído');
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resultado = await ejecutar(escenario, 2);

    expect(resultado).toEqual({ huecoId: 60, mensajeId: 2 });
    expect(escenario.mensajes.filas.find((m) => m.id === 2)?.deficiente).toBe(true);
    espia.mockRestore();
  });
});
