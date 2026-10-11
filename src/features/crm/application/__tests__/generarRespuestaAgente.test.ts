import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConocimientoCrmRepository,
  ContactoConEmpresa,
  ConversacionCrmRepository,
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  GeneradorRespuestaPort,
  ListarMensajesOpciones,
  MemoriaConversacionPort,
  MensajeCrmRepository,
  ResultadoEnvioWhatsapp,
  EntradaGuardarMemoria,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  CrearMensajeInput,
  DireccionMensaje,
  EmisorMensaje,
  EntradaConocimiento,
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  EstadoConversacion,
  MensajeCrm,
  ObservacionDestilada,
  ObservacionMemoria,
  RespuestaGenerada,
  ResultadoGuardarMemoria,
} from '../../domain/entities';
import { enmascararTelefonos, GenerarRespuestaAgenteUseCase } from '../generarRespuestaAgente';
import { crearConfigAgente, type ConfigAgente } from '../configAgente';

/**
 * Use-case contract for the AI response engine (agente-ia-crm E2·T4).
 * Hexagonal: exercised against the PORTS with in-memory fakes (the
 * procesarMensajeWhatsapp/responderConversacion test style). Pinned:
 * - No-op guards run BEFORE any write/recall/LLM call and leave zero
 *   side effects: missing conversation, non-ACTIVA_IA estado, kill
 *   switch, out of hours (day + overnight wrap), no client message,
 *   no phone on the conversation.
 * - Exchange limit counts IA messages in the WHOLE thread (beyond the
 *   MAX_HISTORIAL window) and escalates WITHOUT calling the generator.
 * - Decision: respond only when enScope && !requiereAyudaHumana &&
 *   score >= umbral (>= inclusive at the exact threshold).
 * - Outbox-lite mirror of responderConversacion: OUT/IA row persisted
 *   PENDIENTE with RAG audit columns (fuentes JSON from idsConocimiento
 *   with recall titulos, unknown ids skipped; score; modelo) → send →
 *   ENVIADO/wamid or FALLIDO + FALLIDO_ENVIO (estado stays ACTIVA_IA,
 *   T5 retries, NO distillation).
 * - Escalation (any reason) flips REQUIERE_HUMANO only AFTER a
 *   successful send.
 * - PII: phones masked with '[teléfono]' ONLY inside the generator
 *   input (consulta + historial); persisted/sent/distilled bodies stay
 *   verbatim.
 * - Distillation runs only on RESPONDIDO, only with empresaId,
 *   best-effort (memory failures warn with codigo/conversacionId only
 *   and never change the result).
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  actividades: Array<{ id: number; direccion: 'IN' | 'OUT' }> = [];
  cambiosEstado: Array<{ id: number; estado: EstadoConversacion }> = [];

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  async crear(datos: CrearConversacionInput): Promise<ConversacionCrm> {
    const ahora = new Date().toISOString();
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

  async actualizarEstado(id: number, estado: EstadoConversacion): Promise<ConversacionCrm | null> {
    this.cambiosEstado.push({ id, estado });
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.estado = estado;
    fila.actualizadoEn = new Date().toISOString();
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
    const fila = this.filas.find((f) => f.id === id);
    if (!fila) throw new Error(`conversación ${id} inexistente en el fake`);
    fila.ultimoMensajeEn = new Date().toISOString();
    if (direccion === 'IN') fila.noLeidos += 1;
    fila.actualizadoEn = fila.ultimoMensajeEn;
    this.actividades.push({ id, direccion });
  }
}

class FakeMensajes implements MensajeCrmRepository {
  escritas: CrearMensajeInput[] = [];
  /** All rows ascending by id (seeded hilo + created OUT rows). */
  filas: MensajeCrm[] = [];
  private siguienteId = 1000;

  sembrarHilo(fila: MensajeCrm): void {
    this.filas.push(fila);
  }

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
      fuentes: datos.fuentes ?? null,
      score: datos.score ?? null,
      modelo: datos.modelo ?? null,
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
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    Object.assign(fila, datos);
    return structuredClone(fila);
  }

  async existePorIdempotenciaKey(): Promise<boolean> {
    return false;
  }

  async listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]> {
    const cursor = opciones.antesDeId ?? Number.POSITIVE_INFINITY;
    const propias = this.filas.filter(
      (f) => f.conversacionId === conversacionId && f.id < cursor,
    );
    const ventana = propias.slice(-opciones.limite);
    return [...ventana].reverse();
  }
}

class FakeConocimiento implements ConocimientoCrmRepository {
  entradas: EntradaConocimiento[] = [];
  consultas: string[] = [];

  async listarActivas(): Promise<EntradaConocimiento[]> {
    return this.entradas;
  }

  async buscarPorTexto(texto: string): Promise<EntradaConocimiento[]> {
    this.consultas.push(texto);
    return this.entradas;
  }
}

class FakeMemoria implements MemoriaConversacionPort {
  contextos: number[] = [];
  busquedas: Array<{ consulta: string; empresaId: number; conversacionId: number; limite: number }> =
    [];
  guardadas: EntradaGuardarMemoria[] = [];
  pineadas: number[] = [];
  contextoObservaciones: ObservacionMemoria[] = [];
  busquedaObservaciones: ObservacionMemoria[] = [];
  falloGuardar: Error | null = null;

  async contexto(empresaId: number): Promise<ObservacionMemoria[]> {
    this.contextos.push(empresaId);
    return this.contextoObservaciones;
  }

  async buscar(
    consulta: string,
    empresaId: number,
    conversacionId: number,
    limite: number,
  ): Promise<ObservacionMemoria[]> {
    this.busquedas.push({ consulta, empresaId, conversacionId, limite });
    return this.busquedaObservaciones;
  }

  async guardar(entrada: EntradaGuardarMemoria): Promise<ResultadoGuardarMemoria> {
    if (this.falloGuardar !== null) throw this.falloGuardar;
    this.guardadas.push(structuredClone(entrada));
    return { id: 500 + this.guardadas.length, estado: 'guardado' };
  }

  async pinear(id: number): Promise<void> {
    this.pineadas.push(id);
  }
}

class FakeGenerador implements GeneradorRespuestaPort {
  entradasGenerar: EntradaGenerarRespuesta[] = [];
  entradasDestilar: EntradaDestilacion[] = [];
  respuesta: RespuestaGenerada = {
    texto: 'El examen incluye examen médico, audiometría y espirometría.',
    scoreConfianza: 0.9,
    enScope: true,
    requiereAyudaHumana: false,
    idsConocimiento: [7],
    modelo: 'modelo-prueba',
  };
  observaciones: ObservacionDestilada[] = [];

  async generarRespuesta(entrada: EntradaGenerarRespuesta): Promise<RespuestaGenerada> {
    this.entradasGenerar.push(structuredClone(entrada));
    return structuredClone(this.respuesta);
  }

  async destilar(entrada: EntradaDestilacion): Promise<ObservacionDestilada[]> {
    this.entradasDestilar.push(structuredClone(entrada));
    return structuredClone(this.observaciones);
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

function conversacionActiva(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: 7,
    contactoId: 42,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.1349',
    estado: 'ACTIVA_IA',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: ahora,
    noLeidos: 1,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function mensajeDeHilo(
  id: number,
  emisor: EmisorMensaje,
  direccion: DireccionMensaje,
  cuerpo: string,
  conversacionId = 1,
): MensajeCrm {
  return {
    id,
    conversacionId,
    direccion,
    emisor,
    cuerpo,
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

const CONOCIMIENTO: EntradaConocimiento[] = [
  {
    id: 7,
    titulo: 'Examen ocupacional',
    contenido: 'Incluye examen médico, audiometría y espirometría.',
    etiquetas: ['examen'],
    vigenciaDesde: null,
    vigenciaHasta: null,
    activo: true,
  },
  {
    id: 8,
    titulo: 'Precios',
    contenido: 'El precio depende del headcount.',
    etiquetas: [],
    vigenciaDesde: null,
    vigenciaHasta: null,
    activo: true,
  },
];

const CONSULTA = '¿Qué incluye el examen ocupacional?';

/** Mid-window instant for the default 8-18 schedule (local hours). */
const AHORA = new Date(2026, 5, 15, 10, 30, 0);

interface OverridesFakes {
  /** null = sin conversación sembrada. */
  conversacion?: ConversacionCrm | null;
  hilo?: MensajeCrm[];
  respuesta?: Partial<RespuestaGenerada>;
  observaciones?: ObservacionDestilada[];
  envio?: ResultadoEnvioWhatsapp;
  config?: Partial<ConfigAgente>;
  falloGuardar?: Error;
}

function crearFakes(overrides: OverridesFakes = {}): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  conocimiento: FakeConocimiento;
  memoria: FakeMemoria;
  generador: FakeGenerador;
  whatsapp: FakeWhatsApp;
  useCase: GenerarRespuestaAgenteUseCase;
} {
  const conversaciones = new FakeConversaciones();
  if (overrides.conversacion !== null) {
    conversaciones.sembrar(overrides.conversacion ?? conversacionActiva());
  }
  const mensajes = new FakeMensajes();
  const hilo =
    overrides.hilo ?? [mensajeDeHilo(1, 'CLIENTE', 'IN', CONSULTA)];
  for (const fila of hilo) mensajes.sembrarHilo(fila);
  const conocimiento = new FakeConocimiento();
  conocimiento.entradas = CONOCIMIENTO;
  const memoria = new FakeMemoria();
  memoria.falloGuardar = overrides.falloGuardar ?? null;
  const generador = new FakeGenerador();
  Object.assign(generador.respuesta, overrides.respuesta ?? {});
  generador.observaciones = overrides.observaciones ?? [];
  const whatsapp = new FakeWhatsApp();
  if (overrides.envio !== undefined) whatsapp.resultado = overrides.envio;
  const config: ConfigAgente = { ...crearConfigAgente({}), ...overrides.config };
  const useCase = new GenerarRespuestaAgenteUseCase({
    conversaciones,
    mensajes,
    conocimiento,
    memoria,
    generador,
    whatsapp,
    config,
  });
  return { conversaciones, mensajes, conocimiento, memoria, generador, whatsapp, useCase };
}

function sinEfectos(fakes: {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  conocimiento: FakeConocimiento;
  memoria: FakeMemoria;
  generador: FakeGenerador;
  whatsapp: FakeWhatsApp;
}): void {
  expect(fakes.mensajes.escritas).toEqual([]);
  expect(fakes.whatsapp.envios).toEqual([]);
  expect(fakes.generador.entradasGenerar).toEqual([]);
  expect(fakes.generador.entradasDestilar).toEqual([]);
  expect(fakes.memoria.guardadas).toEqual([]);
  expect(fakes.memoria.pineadas).toEqual([]);
  expect(fakes.conversaciones.actividades).toEqual([]);
  expect(fakes.conversaciones.cambiosEstado).toEqual([]);
  expect(fakes.conocimiento.consultas).toEqual([]);
  expect(fakes.memoria.contextos).toEqual([]);
  expect(fakes.memoria.busquedas).toEqual([]);
}


beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GenerarRespuestaAgenteUseCase — no-ops con cero efectos (E2·T4)', () => {
  it('conversación inexistente → CONVERSACION_NO_ACTIVA_IA sin ningún efecto', async () => {
    const fakes = crearFakes({ conversacion: null });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado).toEqual({
      conversacionId: 1,
      resultado: 'CONVERSACION_NO_ACTIVA_IA',
      mensajeId: null,
      score: null,
    });
    sinEfectos(fakes);
  });

  it('estado distinto de ACTIVA_IA (REQUIERE_HUMANO) → CONVERSACION_NO_ACTIVA_IA', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }),
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('CONVERSACION_NO_ACTIVA_IA');
    sinEfectos(fakes);
  });

  it('agente deshabilitado (kill switch) → AGENTE_DESHABILITADO sin efectos', async () => {
    const fakes = crearFakes({ config: { habilitado: false } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado).toEqual({
      conversacionId: 1,
      resultado: 'AGENTE_DESHABILITADO',
      mensajeId: null,
      score: null,
    });
    sinEfectos(fakes);
  });

  it('fuera de horario diurno (hora 20 y hora 7 con ventana 8-18) → FUERA_DE_HORARIO sin efectos', async () => {
    for (const hora of [20, 7]) {
      const fakes = crearFakes();
      const ahora = new Date(2026, 5, 15, hora, 0, 0);

      const resultado = await fakes.useCase.ejecutar(1, ahora);

      expect(resultado.resultado).toBe('FUERA_DE_HORARIO');
      expect(fakes.conversaciones.filas[0]?.estado).toBe('ACTIVA_IA');
      sinEfectos(fakes);
    }
  });

  it('ventana nocturna (desde 20 hasta 6): hora 23 responde, hora 9 está fuera', async () => {
    const fakesNoche = crearFakes({ config: { horarioDesde: 20, horarioHasta: 6 } });

    const respuestaNocturna = await fakesNoche.useCase.ejecutar(1, new Date(2026, 5, 15, 23, 0, 0));
    expect(respuestaNocturna.resultado).toBe('RESPONDIDO');

    const fakesDia = crearFakes({ config: { horarioDesde: 20, horarioHasta: 6 } });
    const respuestaDiurna = await fakesDia.useCase.ejecutar(1, new Date(2026, 5, 15, 9, 0, 0));
    expect(respuestaDiurna.resultado).toBe('FUERA_DE_HORARIO');
    sinEfectos(fakesDia);
  });

  it('hilo sin mensaje IN/CLIENTE → CONVERSACION_NO_ACTIVA_IA (nada que responder)', async () => {
    const fakes = crearFakes({
      hilo: [
        mensajeDeHilo(1, 'IA', 'OUT', 'Hola, ¿en qué te ayudo?'),
        mensajeDeHilo(2, 'HUMANO', 'OUT', 'Yo sigo el caso'),
      ],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('CONVERSACION_NO_ACTIVA_IA');
    sinEfectos(fakes);
  });

  it('conversación sin teléfono → CONVERSACION_NO_ACTIVA_IA sin efectos (guard de SIN_TELEFONO)', async () => {
    const fakes = crearFakes({ conversacion: conversacionActiva({ telefono: null }) });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('CONVERSACION_NO_ACTIVA_IA');
    sinEfectos(fakes);
  });
});

describe('GenerarRespuestaAgenteUseCase — límite de intercambios (E2·T4)', () => {
  it('IA en el hilo COMPLETO (más allá de MAX_HISTORIAL) ≥ max → ESCALADO sin llamar al generador', async () => {
    // 2 mensajes IA al INICIO de un hilo de 12: solo el conteo de hilo
    // completo los ve (la ventana de historial de 10 no alcanza).
    const hilo: MensajeCrm[] = [
      mensajeDeHilo(1, 'IA', 'OUT', 'respuesta 1'),
      mensajeDeHilo(2, 'IA', 'OUT', 'respuesta 2'),
    ];
    for (let id = 3; id <= 11; id += 1) {
      hilo.push(mensajeDeHilo(id, 'CLIENTE', 'IN', `consulta intermedia ${id}`));
    }
    hilo.push(mensajeDeHilo(12, 'CLIENTE', 'IN', CONSULTA));
    const fakes = crearFakes({ hilo, config: { maxIntercambios: 2 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado).toEqual({
      conversacionId: 1,
      resultado: 'ESCALADO',
      mensajeId: 1000,
      score: null,
    });
    expect(fakes.generador.entradasGenerar).toEqual([]);
    expect(fakes.conocimiento.consultas).toEqual([]);
    expect(fakes.memoria.contextos).toEqual([]);
    expect(fakes.memoria.busquedas).toEqual([]);
    expect(fakes.mensajes.escritas).toHaveLength(1);
    expect(fakes.mensajes.escritas[0]).toMatchObject({
      direccion: 'OUT',
      emisor: 'IA',
      estadoEnvio: 'PENDIENTE',
      score: null,
      modelo: null,
      fuentes: '[]',
    });
    expect(fakes.mensajes.escritas[0]?.cuerpo).toBe(
      'Gracias por tu consulta. En breve se comunica con vos una persona del equipo de Holomedic.',
    );
    expect(fakes.whatsapp.envios[0]?.cuerpo).toBe(fakes.mensajes.escritas[0]?.cuerpo);
    expect(fakes.mensajes.filas.find((f) => f.id === 1000)?.estadoEnvio).toBe('ENVIADO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([
      { id: 1, estado: 'REQUIERE_HUMANO' },
    ]);
    expect(fakes.conversaciones.filas[0]?.estado).toBe('REQUIERE_HUMANO');
    expect(fakes.generador.entradasDestilar).toEqual([]);
  });
});

describe('GenerarRespuestaAgenteUseCase — decisión de confianza (E2·T4)', () => {
  it('score debajo del umbral → ESCALADO con texto seguro y score auditable', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.4 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(resultado.score).toBe(0.4);
    expect(fakes.mensajes.escritas[0]?.cuerpo).toBe(
      'Gracias por tu consulta. En breve se comunica con vos una persona del equipo de Holomedic.',
    );
    expect(fakes.mensajes.escritas[0]?.score).toBe(0.4);
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'REQUIERE_HUMANO' }]);
    expect(fakes.generador.entradasDestilar).toEqual([]);
  });

  it('enScope false → ESCALADO aunque el score sea alto', async () => {
    const fakes = crearFakes({ respuesta: { enScope: false, scoreConfianza: 0.95 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.whatsapp.envios[0]?.cuerpo).toContain('persona del equipo');
    expect(fakes.conversaciones.filas[0]?.estado).toBe('REQUIERE_HUMANO');
  });

  it('requiereAyudaHumana true → ESCALADO', async () => {
    const fakes = crearFakes({ respuesta: { requiereAyudaHumana: true } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'REQUIERE_HUMANO' }]);
  });

  it('score EXACTAMENTE en el umbral → RESPONDIDO (comparación >=)', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.6 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([]);
  });
});

describe('GenerarRespuestaAgenteUseCase — happy path RESPONDIDO (E2·T4)', () => {
  it('recupera conocimiento+memoria, crea OUT/IA PENDIENTE→ENVIADO con auditoría RAG completa', async () => {
    const fakes = crearFakes({ respuesta: { idsConocimiento: [7, 999] } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado).toEqual({
      conversacionId: 1,
      resultado: 'RESPONDIDO',
      mensajeId: 1000,
      score: 0.9,
    });

    // Recall: conocimiento con la consulta ORIGINAL y memoria solo por empresa.
    expect(fakes.conocimiento.consultas).toEqual([CONSULTA]);
    expect(fakes.memoria.contextos).toEqual([7]);
    expect(fakes.memoria.busquedas).toEqual([
      { consulta: CONSULTA, empresaId: 7, conversacionId: 1, limite: 5 },
    ]);

    // Entrada al generador: proyecciones de conocimiento/memoria.
    const entrada = fakes.generador.entradasGenerar[0];
    expect(entrada?.conocimiento).toEqual([
      { id: 7, titulo: 'Examen ocupacional', contenido: 'Incluye examen médico, audiometría y espirometría.' },
    ]);

    // Fila creada: OUT/IA/TEXTO/WHATSAPP PENDIENTE con score/modelo/fuentes
    // (ids desconocidos saltados — solo el 7 tiene título del recall).
    expect(fakes.mensajes.escritas).toHaveLength(1);
    expect(fakes.mensajes.escritas[0]).toEqual({
      conversacionId: 1,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'El examen incluye examen médico, audiometría y espirometría.',
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: null,
      idempotenciaKey: null,
      estadoEnvio: 'PENDIENTE',
      fuentes: JSON.stringify([{ id: 7, tipo: 'KB', titulo: 'Examen ocupacional' }]),
      score: 0.9,
      modelo: 'modelo-prueba',
    });

    // Envío + confirmación + actividad OUT una sola vez; estado intacto.
    expect(fakes.whatsapp.envios).toEqual([
      { telefonoE164: '+595981234567', cuerpo: 'El examen incluye examen médico, audiometría y espirometría.' },
    ]);
    const fila = fakes.mensajes.filas.find((f) => f.id === 1000);
    expect(fila?.estadoEnvio).toBe('ENVIADO');
    expect(fila?.wamid).toBe('wamid.OK1');
    expect(fakes.conversaciones.actividades).toEqual([{ id: 1, direccion: 'OUT' }]);
    expect(fakes.conversaciones.cambiosEstado).toEqual([]);
    expect(fakes.conversaciones.filas[0]?.estado).toBe('ACTIVA_IA');
  });
});

describe('GenerarRespuestaAgenteUseCase — fallo de envío (E2·T4)', () => {
  it('envío falla → FALLIDO_ENVIO + fila FALLIDO + estado ACTIVA_IA + SIN destilación', async () => {
    const fakes = crearFakes({
      envio: { ok: false, error: 'KAPSO_ERROR', detalle: 'kapso caído' },
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado).toEqual({
      conversacionId: 1,
      resultado: 'FALLIDO_ENVIO',
      mensajeId: 1000,
      score: 0.9,
    });
    expect(fakes.mensajes.filas.find((f) => f.id === 1000)?.estadoEnvio).toBe('FALLIDO');
    expect(fakes.conversaciones.filas[0]?.estado).toBe('ACTIVA_IA');
    expect(fakes.conversaciones.cambiosEstado).toEqual([]);
    expect(fakes.generador.entradasDestilar).toEqual([]);
    expect(fakes.conversaciones.actividades).toEqual([]);
  });
});

describe('GenerarRespuestaAgenteUseCase — destilación post-envío (E2·T4)', () => {
  const OBSERVACIONES: ObservacionDestilada[] = [
    { tipo: 'acuerdo', titulo: 'Examen el martes', contenido: 'Acordado examen el martes 10.', pinear: true },
    { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
  ];

  it('acuerdo pinear=true → nivel empresa + pinear; hecho_cliente → nivel chat sin pinear', async () => {
    const fakes = crearFakes({ observaciones: OBSERVACIONES });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    // destilar recibe la consulta ORIGINAL (sin mascarar) y el texto final.
    expect(fakes.generador.entradasDestilar).toEqual([
      { consulta: CONSULTA, respuesta: 'El examen incluye examen médico, audiometría y espirometría.' },
    ]);
    expect(fakes.memoria.guardadas).toHaveLength(2);
    expect(fakes.memoria.guardadas[0]).toEqual({
      empresaId: 7,
      conversacionId: 1,
      nivel: 'empresa',
      tipo: 'acuerdo',
      titulo: 'Examen el martes',
      contenido: 'Acordado examen el martes 10.',
      operationId: 'dest-1-1000-0',
    });
    expect(fakes.memoria.guardadas[1]).toEqual({
      empresaId: 7,
      conversacionId: 1,
      nivel: 'chat',
      tipo: 'hecho_cliente',
      titulo: 'Rubro minería',
      contenido: 'Trabaja en minería.',
      operationId: 'dest-1-1000-1',
    });
    expect(fakes.memoria.pineadas).toEqual([501]);
  });

  it('fallo de memoria al guardar se traga: sigue RESPONDIDO y warn con codigo+id, sin cuerpos', async () => {
    const fallo = Object.assign(new Error('boom'), { codigo: 'MEMORIA_ERROR' });
    const fakes = crearFakes({ observaciones: OBSERVACIONES, falloGuardar: fallo });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.memoria.guardadas).toEqual([]);
    expect(fakes.memoria.pineadas).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
    const salida = JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(salida).toContain('MEMORIA_ERROR');
    expect(salida).toContain('"conversacionId":1');
    expect(salida).not.toContain('Examen el martes');
    expect(salida).not.toContain('Rubro minería');
    expect(salida).not.toContain('Acordado examen');
  });

  it('empresaId null → sin recall de memoria y SIN destilación (pero RESPONDIDO)', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ empresaId: null }),
      observaciones: OBSERVACIONES,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.memoria.contextos).toEqual([]);
    expect(fakes.memoria.busquedas).toEqual([]);
    expect(fakes.generador.entradasDestilar).toEqual([]);
    expect(fakes.memoria.guardadas).toEqual([]);
  });
});

describe('GenerarRespuestaAgenteUseCase — PII: mascarar solo la entrada LLM (E2·T4)', () => {
  it('teléfonos → [teléfono] en consulta/historial del generador; cuerpos persistidos intactos', async () => {
    const consultaConTelefono = 'Mi número es +595 981 234 567, ¿qué incluye el examen ocupacional?';
    const fakes = crearFakes({
      hilo: [
        mensajeDeHilo(1, 'CLIENTE', 'IN', 'Hola, llamame al 0981-234-567'),
        mensajeDeHilo(2, 'IA', 'OUT', 'Un placer ayudarte'),
        mensajeDeHilo(3, 'CLIENTE', 'IN', consultaConTelefono),
      ],
      respuesta: { texto: 'El examen incluye examen médico. Escribime al 0981 234 567.' },
      observaciones: [],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    const entrada = fakes.generador.entradasGenerar[0];
    expect(entrada?.consulta).toBe('Mi número es [teléfono], ¿qué incluye el examen ocupacional?');
    expect(entrada?.historial).toEqual([
      { emisor: 'CLIENTE', texto: 'Hola, llamame al [teléfono]' },
      { emisor: 'IA', texto: 'Un placer ayudarte' },
      { emisor: 'CLIENTE', texto: 'Mi número es [teléfono], ¿qué incluye el examen ocupacional?' },
    ]);
    // El mensaje persistido y el envío conservan el texto ORIGINAL de la IA.
    expect(fakes.mensajes.escritas[0]?.cuerpo).toBe('El examen incluye examen médico. Escribime al 0981 234 567.');
    expect(fakes.whatsapp.envios[0]?.cuerpo).toBe('El examen incluye examen médico. Escribime al 0981 234 567.');
    // La destilación corre (sin observaciones que guardar) y recibe la
    // consulta ORIGINAL (sin mascarar) y el texto final verbatim.
    expect(fakes.generador.entradasDestilar).toEqual([
      {
        consulta: consultaConTelefono,
        respuesta: 'El examen incluye examen médico. Escribime al 0981 234 567.',
      },
    ]);
    expect(fakes.memoria.guardadas).toEqual([]);
  });
});

describe('enmascararTelefonos (E2·T4)', () => {
  it('mascara corridas de ≥ 8 dígitos con separadores comunes', () => {
    expect(enmascararTelefonos('+595 981 234 567')).toBe('[teléfono]');
    expect(enmascararTelefonos('0981-234-567')).toBe('[teléfono]');
    expect(enmascararTelefonos('(021) 555-1234')).toBe('[teléfono]');
    expect(enmascararTelefonos('+54.11.5555.1234')).toBe('[teléfono]');
    expect(enmascararTelefonos('595981234567')).toBe('[teléfono]');
    expect(enmascararTelefonos('mi tel 12345678 ok')).toBe('mi tel [teléfono] ok');
  });

  it('NO mascara corridas cortas ni números comunes', () => {
    expect(enmascararTelefonos('pedido 123456')).toBe('pedido 123456');
    expect(enmascararTelefonos('año 2024, ítem 7')).toBe('año 2024, ítem 7');
    expect(enmascararTelefonos('sin numeros')).toBe('sin numeros');
  });

  it('mascara varios teléfonos en el mismo texto y conserva el resto', () => {
    expect(enmascararTelefonos('fijos: (021) 555-1234 y cel +595981234567!')).toBe(
      'fijos: [teléfono] y cel [teléfono]!',
    );
  });
});
