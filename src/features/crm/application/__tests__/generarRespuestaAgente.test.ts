import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConocimientoCrmRepository,
  ContactoConEmpresa,
  ConversacionCrmRepository,
  CrmEmpresaRepositoryPort,
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  FiltrosEmpresas,
  GeneradorRespuestaPort,
  ListarMensajesOpciones,
  MemoriaConversacionPort,
  MensajeCrmRepository,
  ResultadoEnvioWhatsapp,
  EntradaGuardarMemoria,
  VincularConversacionDatos,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  CrearMensajeInput,
  DireccionMensaje,
  EmisorMensaje,
  Empresa,
  EntradaConocimiento,
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  EstadoConversacion,
  IdentificacionExtraida,
  MensajeCrm,
  ModoConversacion,
  ObservacionDestilada,
  ObservacionMemoria,
  RespuestaGenerada,
  ResultadoGuardarMemoria,
  SolicitudAyuda,
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
 * - E2·T9 unlinked attendance: PENDIENTE_VINCULACION (empresaId /
 *   contactoId null) runs the SAME engine — contactoNuevo:true into the
 *   generator, NO memory recall and NO distillation — and after a
 *   RESPONDIDO send extracts the identification best-effort; when the
 *   named empresa EXACTLY matches ONE CRM_Empresas row (normalized:
 *   trim/lowercase/strip-diacritics) it creates the contacto, vincula
 *   (estado ACTIVA_IA) and pins modo IA. TOMADA_HUMANO / CERRADA /
 *   PAUSADA / REQUIERE_HUMANO stay no-ops. Any identification failure
 *   (throw, 0 or >1 exact matches, empresas dep absent) leaves the
 *   already-sent outcome untouched.
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  actividades: Array<{ id: number; direccion: 'IN' | 'OUT' }> = [];
  cambiosEstado: Array<{ id: number; estado: EstadoConversacion }> = [];
  vinculaciones: Array<{ id: number; datos: VincularConversacionDatos }> = [];
  contactosCreados: Array<{ empresaId: number; datos: { nombre: string } }> = [];
  cambiosModo: Array<{ id: number; modo: ModoConversacion }> = [];
  solicitudes: SolicitudAyuda[] = [];
  solicitudesCreadas: Array<{
    conversacionId: number;
    mensajeId: number | null;
    consulta: string;
    terminosBuscados: string[];
    score: number | null;
  }> = [];
  private siguienteContactoId = 500;
  private siguienteSolicitudId = 900;

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  sembrarSolicitud(sobres: Partial<SolicitudAyuda> & Pick<SolicitudAyuda, 'conversacionId'>): SolicitudAyuda {
    const fila: SolicitudAyuda = {
      id: this.siguienteSolicitudId++,
      mensajeId: null,
      consulta: CONSULTA,
      terminosBuscados: [],
      score: null,
      estado: 'PENDIENTE',
      indicacion: null,
      resueltaPor: null,
      creadoEn: new Date(),
      resueltaEn: null,
      ...sobres,
    };
    this.solicitudes.push(fila);
    return fila;
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

  async vincular(id: number, datos: VincularConversacionDatos): Promise<ConversacionCrm | null> {
    this.vinculaciones.push({ id, datos: structuredClone(datos) });
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.empresaId = datos.empresaId;
    fila.contactoId = datos.contactoId;
    if (datos.telefono !== undefined) fila.telefono = datos.telefono;
    if (datos.estado !== undefined) fila.estado = datos.estado;
    fila.actualizadoEn = new Date().toISOString();
    return structuredClone(fila);
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

  async crearContacto(
    empresaId: number,
    datos: { nombre: string; cargo?: string | null },
  ): Promise<{ contactoId: number }> {
    this.contactosCreados.push({ empresaId, datos: { nombre: datos.nombre } });
    return { contactoId: this.siguienteContactoId++ };
  }

  async actualizarModo(id: number, modo: ModoConversacion): Promise<ConversacionCrm | null> {
    this.cambiosModo.push({ id, modo });
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.modo = modo;
    fila.actualizadoEn = new Date().toISOString();
    return structuredClone(fila);
  }

  async crearSolicitudAyuda(entrada: {
    conversacionId: number;
    mensajeId?: number | null;
    consulta: string;
    terminosBuscados: string[];
    score: number | null;
  }): Promise<SolicitudAyuda> {
    this.solicitudesCreadas.push({
      conversacionId: entrada.conversacionId,
      mensajeId: entrada.mensajeId ?? null,
      consulta: entrada.consulta,
      terminosBuscados: [...entrada.terminosBuscados],
      score: entrada.score,
    });
    const fila: SolicitudAyuda = {
      id: this.siguienteSolicitudId++,
      conversacionId: entrada.conversacionId,
      mensajeId: entrada.mensajeId ?? null,
      consulta: entrada.consulta,
      terminosBuscados: [...entrada.terminosBuscados],
      score: entrada.score,
      estado: 'PENDIENTE',
      indicacion: null,
      resueltaPor: null,
      creadoEn: new Date(),
      resueltaEn: null,
    };
    this.solicitudes.push(fila);
    return structuredClone(fila);
  }

  async obtenerSolicitudAyudaPendiente(conversacionId: number): Promise<SolicitudAyuda | null> {
    const pendientes = this.solicitudes
      .filter((s) => s.conversacionId === conversacionId && s.estado === 'PENDIENTE')
      .sort((a, b) => b.id - a.id);
    const fila = pendientes[0];
    return fila ? structuredClone(fila) : null;
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
  entradasIdentificar: Array<{ consulta: string; respuesta: string }> = [];
  identificacion: IdentificacionExtraida | null = { nombre: null, empresa: null };
  falloIdentificar: Error | null = null;
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

  async extraerIdentificacion(entrada: {
    consulta: string;
    respuesta: string;
  }): Promise<IdentificacionExtraida | null> {
    this.entradasIdentificar.push(structuredClone(entrada));
    if (this.falloIdentificar !== null) throw this.falloIdentificar;
    return structuredClone(this.identificacion);
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

class FakeEmpresas implements CrmEmpresaRepositoryPort {
  filas: Empresa[] = [];
  consultas: FiltrosEmpresas[] = [];

  async listar(filtros?: FiltrosEmpresas): Promise<Empresa[]> {
    this.consultas.push(structuredClone(filtros ?? {}));
    return structuredClone(this.filas);
  }

  async crear(): Promise<Empresa> {
    throw new Error('no requerido en este fake');
  }

  async obtenerPorId(): Promise<Empresa | null> {
    throw new Error('no requerido en este fake');
  }

  async actualizar(): Promise<Empresa | null> {
    throw new Error('no requerido en este fake');
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

/** Unlinked conversation (E2·T9): born PENDIENTE_VINCULACION, no empresa/contacto. */
function conversacionDesvinculada(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  return conversacionActiva({
    empresaId: null,
    contactoId: null,
    estado: 'PENDIENTE_VINCULACION',
    ...sobres,
  });
}

function empresaCrm(sobres: Partial<Empresa> = {}): Empresa {
  return {
    id: 7,
    ruc: '80012345-6',
    rucNormalizado: '800123456',
    razonSocial: 'Constructora X S.A.',
    tipo: 'Cliente',
    origen: null,
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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
  identificacion?: IdentificacionExtraida | null;
  falloIdentificar?: Error;
  empresasFilas?: Empresa[];
  /** true = motor construido SIN el dep empresas (E2·T9 opcional). */
  sinEmpresas?: boolean;
}

function crearFakes(overrides: OverridesFakes = {}): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  conocimiento: FakeConocimiento;
  memoria: FakeMemoria;
  generador: FakeGenerador;
  whatsapp: FakeWhatsApp;
  empresas: FakeEmpresas | null;
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
  generador.identificacion = overrides.identificacion ?? { nombre: null, empresa: null };
  generador.falloIdentificar = overrides.falloIdentificar ?? null;
  const whatsapp = new FakeWhatsApp();
  if (overrides.envio !== undefined) whatsapp.resultado = overrides.envio;
  const empresas = new FakeEmpresas();
  empresas.filas = overrides.empresasFilas ?? [];
  const config: ConfigAgente = { ...crearConfigAgente({}), ...overrides.config };
  const useCase = new GenerarRespuestaAgenteUseCase({
    conversaciones,
    mensajes,
    conocimiento,
    memoria,
    generador,
    whatsapp,
    ...(overrides.sinEmpresas === true ? {} : { empresas }),
    config,
  });
  return { conversaciones, mensajes, conocimiento, memoria, generador, whatsapp, empresas, useCase };
}

function sinEfectos(fakes: {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  conocimiento: FakeConocimiento;
  memoria: FakeMemoria;
  generador: FakeGenerador;
  whatsapp: FakeWhatsApp;
  empresas: FakeEmpresas | null;
}): void {
  expect(fakes.mensajes.escritas).toEqual([]);
  expect(fakes.whatsapp.envios).toEqual([]);
  expect(fakes.generador.entradasGenerar).toEqual([]);
  expect(fakes.generador.entradasDestilar).toEqual([]);
  expect(fakes.generador.entradasIdentificar).toEqual([]);
  expect(fakes.memoria.guardadas).toEqual([]);
  expect(fakes.memoria.pineadas).toEqual([]);
  expect(fakes.conversaciones.actividades).toEqual([]);
  expect(fakes.conversaciones.cambiosEstado).toEqual([]);
  expect(fakes.conversaciones.vinculaciones).toEqual([]);
  expect(fakes.conversaciones.contactosCreados).toEqual([]);
  expect(fakes.conversaciones.cambiosModo).toEqual([]);
  expect(fakes.conocimiento.consultas).toEqual([]);
  expect(fakes.memoria.contextos).toEqual([]);
  expect(fakes.memoria.busquedas).toEqual([]);
  if (fakes.empresas !== null) expect(fakes.empresas.consultas).toEqual([]);
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

  it('estados TOMADA_HUMANO / PAUSADA / CERRADA → CONVERSACION_NO_ACTIVA_IA (E2·T9: solo estados IA-atendidos)', async () => {
    for (const estado of ['TOMADA_HUMANO', 'PAUSADA', 'CERRADA'] as const) {
      const fakes = crearFakes({ conversacion: conversacionActiva({ estado }) });

      const resultado = await fakes.useCase.ejecutar(1, AHORA);

      expect(resultado.resultado).toBe('CONVERSACION_NO_ACTIVA_IA');
      sinEfectos(fakes);
    }
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
    expect(entrada?.contactoNuevo).toBe(false);
    expect(fakes.generador.entradasIdentificar).toEqual([]);
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

describe('GenerarRespuestaAgenteUseCase — conversación desvinculada (E2·T9)', () => {
  const TEXTO_RESPUESTA = 'El examen incluye examen médico, audiometría y espirometría.';

  it('PENDIENTE_VINCULACION → RESPONDIDO con contactoNuevo true, recall de conocimiento, SIN memoria ni destilación, extraerIdentificacion llamado', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: null, empresa: null },
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(resultado.mensajeId).toBe(1000);
    // El KB responde igual (preguntas genéricas tempranas) — la memoria no.
    expect(fakes.conocimiento.consultas).toEqual([CONSULTA]);
    expect(fakes.generador.entradasGenerar[0]?.contactoNuevo).toBe(true);
    expect(fakes.memoria.contextos).toEqual([]);
    expect(fakes.memoria.busquedas).toEqual([]);
    expect(fakes.generador.entradasDestilar).toEqual([]);
    expect(fakes.memoria.guardadas).toEqual([]);
    // Identificación best-effort post-envío con la consulta ORIGINAL y el texto enviado.
    expect(fakes.generador.entradasIdentificar).toEqual([
      { consulta: CONSULTA, respuesta: TEXTO_RESPUESTA },
    ]);
    // Sin empresa extraída → cero efectos de vinculación, estado intacto.
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
    expect(fakes.conversaciones.cambiosModo).toEqual([]);
    expect(fakes.conversaciones.filas[0]).toMatchObject({
      estado: 'PENDIENTE_VINCULACION',
      empresaId: null,
      contactoId: null,
    });
  });

  it('extraerIdentificacion → null: nada se vincula y el resultado no cambia', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: null,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
  });

  it('empresa nombrada con UN match EXACTO normalizado → crea contacto, vincula ACTIVA_IA y fija modo IA', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana Giménez', empresa: '  Constructora X S.A.  ' },
      empresasFilas: [empresaCrm()],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    // La búsqueda viaja NORMALIZADA (trim + lowercase + sin diacríticos).
    expect(fakes.empresas?.consultas).toEqual([{ q: 'constructora x s.a.' }]);
    expect(fakes.conversaciones.contactosCreados).toEqual([
      { empresaId: 7, datos: { nombre: 'Ana Giménez' } },
    ]);
    expect(fakes.conversaciones.vinculaciones).toEqual([
      { id: 1, datos: { empresaId: 7, contactoId: 500, estado: 'ACTIVA_IA' } },
    ]);
    expect(fakes.conversaciones.cambiosModo).toEqual([{ id: 1, modo: 'IA' }]);
    expect(fakes.conversaciones.filas[0]).toMatchObject({
      estado: 'ACTIVA_IA',
      modo: 'IA',
      empresaId: 7,
      contactoId: 500,
    });
    expect(fakes.conversaciones.cambiosEstado).toEqual([]);
  });

  it('diacríticos: Construcción ≡ Construccion tras normalizar ambos lados', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana', empresa: 'Construcción X' },
      empresasFilas: [empresaCrm({ razonSocial: 'Construccion X' })],
    });

    await fakes.useCase.ejecutar(1, AHORA);

    expect(fakes.conversaciones.vinculaciones).toHaveLength(1);
    expect(fakes.conversaciones.vinculaciones[0]?.datos.empresaId).toBe(7);
  });

  it('nombre null pero empresa con match → contacto nace como Contacto WhatsApp', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: null, empresa: 'Constructora X S.A.' },
      empresasFilas: [empresaCrm()],
    });

    await fakes.useCase.ejecutar(1, AHORA);

    expect(fakes.conversaciones.contactosCreados).toEqual([
      { empresaId: 7, datos: { nombre: 'Contacto WhatsApp' } },
    ]);
    expect(fakes.conversaciones.vinculaciones).toHaveLength(1);
  });

  it('2 empresas con el MISMO razonSocial → ambiguo: NADA se vincula', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana', empresa: 'Constructora X S.A.' },
      empresasFilas: [empresaCrm(), empresaCrm({ id: 8, ruc: '90011122-3', rucNormalizado: '900111223' })],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
    expect(fakes.conversaciones.cambiosModo).toEqual([]);
    expect(fakes.conversaciones.filas[0]?.estado).toBe('PENDIENTE_VINCULACION');
  });

  it('0 resultados de la búsqueda → nada se vincula (sigue recolectando)', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana', empresa: 'Empresa Inexistente' },
      empresasFilas: [],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
  });

  it('match PARCIAL no alcanza: la fila devuelta no coincide EXACTO → nada se vincula', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana', empresa: 'Constructora X' },
      empresasFilas: [empresaCrm({ razonSocial: 'Constructora X S.A.' })],
    });

    await fakes.useCase.ejecutar(1, AHORA);

    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
  });

  it('dep empresas AUSENTE → identificación corre pero sin efectos de vinculación (opcional E2·T9)', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      identificacion: { nombre: 'Ana', empresa: 'Constructora X S.A.' },
      sinEmpresas: true,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.generador.entradasIdentificar).toHaveLength(1);
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
  });

  it('extraerIdentificacion revienta → best-effort: sigue RESPONDIDO y warn con codigo+id, sin cuerpos', async () => {
    const fallo = Object.assign(new Error('boom'), { codigo: 'GENERADOR_TIMEOUT' });
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      falloIdentificar: fallo,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
    const salida = JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(salida).toContain('GENERADOR_TIMEOUT');
    expect(salida).toContain('"conversacionId":1');
    expect(salida).not.toContain('Constructora');
    expect(salida).not.toContain(CONSULTA);
  });

  it('escalado en desvinculada → texto seguro + REQUIERE_HUMANO, SIN identificación ni vinculación', async () => {
    const fakes = crearFakes({
      conversacion: conversacionDesvinculada(),
      respuesta: { scoreConfianza: 0.3 },
      identificacion: { nombre: 'Ana', empresa: 'Constructora X S.A.' },
      empresasFilas: [empresaCrm()],
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.whatsapp.envios[0]?.cuerpo).toContain('persona del equipo');
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'REQUIERE_HUMANO' }]);
    expect(fakes.generador.entradasIdentificar).toEqual([]);
    expect(fakes.conversaciones.contactosCreados).toEqual([]);
    expect(fakes.conversaciones.vinculaciones).toEqual([]);
  });

  it('conversación ya vinculada (contactoId presente) → extraerIdentificacion NO se llama', async () => {
    const fakes = crearFakes({ identificacion: { nombre: 'Ana', empresa: 'Constructora X S.A.' } });

    await fakes.useCase.ejecutar(1, AHORA);

    expect(fakes.generador.entradasIdentificar).toEqual([]);
    expect(fakes.empresas?.consultas).toEqual([]);
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

describe('GenerarRespuestaAgenteUseCase — solicitud de ayuda al escalar (E3·T2)', () => {
  it('escalado por score persiste la solicitud: consulta+términos del prefilter+score+mensajeId disparador', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.4 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([
      {
        conversacionId: 1,
        mensajeId: 1,
        consulta: CONSULTA,
        terminosBuscados: ['que', 'incluye', 'examen', 'ocupacional'],
        score: 0.4,
      },
    ]);
    expect(fakes.conversaciones.solicitudes[0]).toMatchObject({ estado: 'PENDIENTE' });
  });

  it('escalado por límite también persiste la solicitud (score null — no hubo generación)', async () => {
    const hilo: MensajeCrm[] = [
      mensajeDeHilo(1, 'IA', 'OUT', 'respuesta 1'),
      mensajeDeHilo(2, 'CLIENTE', 'IN', CONSULTA),
    ];
    const fakes = crearFakes({ hilo, config: { maxIntercambios: 1 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([
      {
        conversacionId: 1,
        mensajeId: 2,
        consulta: CONSULTA,
        terminosBuscados: ['que', 'incluye', 'examen', 'ocupacional'],
        score: null,
      },
    ]);
  });

  it('con solicitud PENDIENTE ya existente NO apila una segunda (idempotencia de escalado)', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.4 } });
    fakes.conversaciones.sembrarSolicitud({ conversacionId: 1, mensajeId: 1 });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([]);
    expect(fakes.conversaciones.solicitudes).toHaveLength(1);
  });

  it('repo SIN los métodos opcionales E3 → early-skip silencioso: escalado normal, sin crash', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.4 } });
    // Sombrear las capacidades opcionales como ausentes (repo pre-E3).
    (fakes.conversaciones as { crearSolicitudAyuda?: unknown }).crearSolicitudAyuda = undefined;
    (fakes.conversaciones as { obtenerSolicitudAyudaPendiente?: unknown }).obtenerSolicitudAyudaPendiente =
      undefined;

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([]);
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'REQUIERE_HUMANO' }]);
  });

  it('fallo al crear la solicitud es best-effort: el escalado NO cambia (console.error, sin cuerpos)', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.4 } });
    const fallo = Object.assign(new Error('boom'), { codigo: 'SOLICITUD_ERROR' });
    fakes.conversaciones.crearSolicitudAyuda = async () => {
      throw fallo;
    };

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'REQUIERE_HUMANO' }]);
    expect(console.error).toHaveBeenCalled();
    const salida = JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(salida).toContain('SOLICITUD_ERROR');
    expect(salida).not.toContain(CONSULTA);
  });
});

describe('GenerarRespuestaAgenteUseCase — indicación humana (E3·T2)', () => {
  const INDICACION = 'Decile que el examen se coordina para el viernes a las 9.';

  it('REQUIERE_HUMANO + indicación: responde pese a score bajo/fuera de scope, SIN escalado ni nueva solicitud, vuelve a ACTIVA_IA con modo IA, fuentes con el marcador', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }),
      respuesta: { scoreConfianza: 0.2, enScope: false, idsConocimiento: [] },
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(resultado.score).toBe(0.2);
    // La indicación cruza al generador y se envía el texto generado (no el seguro).
    expect(fakes.generador.entradasGenerar[0]?.indicacionHumana).toBe(INDICACION);
    expect(fakes.whatsapp.envios[0]?.cuerpo).toBe(
      'El examen incluye examen médico, audiometría y espirometría.',
    );
    // Sin escalado: flip a ACTIVA_IA + modo IA (retoma la Guía), sin solicitud nueva.
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'ACTIVA_IA' }]);
    expect(fakes.conversaciones.cambiosModo).toEqual([{ id: 1, modo: 'IA' }]);
    expect(fakes.conversaciones.filas[0]?.estado).toBe('ACTIVA_IA');
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([]);
    // Auditoría: fuentes EXTENDIDAS con el marcador (sin ids de KB → solo el marcador).
    const fuentes = JSON.parse(fakes.mensajes.escritas[0]?.fuentes ?? 'null');
    expect(fuentes).toEqual([{ tipo: 'indicacion_humana', titulo: 'Indicación humana' }]);
  });

  it('fuentes con indicación EXTIENDE la lista de KB (no la reemplaza)', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }),
      respuesta: { scoreConfianza: 0.2, idsConocimiento: [7] },
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('RESPONDIDO');
    const fuentes = JSON.parse(fakes.mensajes.escritas[0]?.fuentes ?? 'null');
    expect(fuentes).toEqual([
      { id: 7, tipo: 'KB', titulo: 'Examen ocupacional' },
      { tipo: 'indicacion_humana', titulo: 'Indicación humana' },
    ]);
  });

  it('indicación con teléfono → llega MASCARADA al generador (PII antes de cruzar al LLM)', async () => {
    const fakes = crearFakes({ conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }) });

    await fakes.useCase.ejecutar(1, AHORA, {
      indicacionHumana: 'Llamalo al 0981-234-567 y coordiná el examen',
    });

    expect(fakes.generador.entradasGenerar[0]?.indicacionHumana).toBe(
      'Llamalo al [teléfono] y coordiná el examen',
    );
  });

  it('generador pide ayuda humana CON indicación → responde igual (el humano ya intervino) + warn', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }),
      respuesta: { scoreConfianza: 0.1, enScope: false, requiereAyudaHumana: true },
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([{ id: 1, estado: 'ACTIVA_IA' }]);
    expect(fakes.conversaciones.solicitudesCreadas).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
    const salida = JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(salida).toContain('"conversacionId":1');
    expect(salida).not.toContain(INDICACION);
  });

  it('kill switch sigue cortando CON indicación (la indicación autoriza contenido, no autonomía)', async () => {
    const fakes = crearFakes({ config: { habilitado: false } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('AGENTE_DESHABILITADO');
    sinEfectos(fakes);
  });

  it('fuera de horario CON indicación → FUERA_DE_HORARIO (la indicación no abre ventanas)', async () => {
    const fakes = crearFakes();

    const resultado = await fakes.useCase.ejecutar(
      1,
      new Date(2026, 5, 15, 21, 0, 0),
      { indicacionHumana: INDICACION },
    );

    expect(resultado.resultado).toBe('FUERA_DE_HORARIO');
    sinEfectos(fakes);
  });

  it('límite de intercambios CON indicación → sigue escalando Y persiste la solicitud', async () => {
    const hilo: MensajeCrm[] = [
      mensajeDeHilo(1, 'IA', 'OUT', 'respuesta 1'),
      mensajeDeHilo(2, 'CLIENTE', 'IN', CONSULTA),
    ];
    const fakes = crearFakes({
      hilo,
      config: { maxIntercambios: 1 },
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO' }),
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.generador.entradasGenerar).toEqual([]);
    expect(fakes.conversaciones.solicitudesCreadas).toHaveLength(1);
  });

  it('ACTIVA_IA con indicación → responde SIN flip de estado (ya está en IA)', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.2 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conversaciones.cambiosEstado).toEqual([]);
    expect(fakes.conversaciones.cambiosModo).toEqual([]);
  });

  it('TOMADA_HUMANO sigue siendo no-op aun con indicación (un humano tiene la conversación)', async () => {
    const fakes = crearFakes({ conversacion: conversacionActiva({ estado: 'TOMADA_HUMANO' }) });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: INDICACION });

    expect(resultado.resultado).toBe('CONVERSACION_NO_ACTIVA_IA');
    sinEfectos(fakes);
  });

  it('indicación en blanco ("   ") se ignora: corre el camino normal (gate activo)', async () => {
    const fakes = crearFakes({ respuesta: { scoreConfianza: 0.2 } });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: '   ' });

    expect(resultado.resultado).toBe('ESCALADO');
    expect(fakes.conversaciones.solicitudesCreadas).toHaveLength(1);
  });
});

describe('GenerarRespuestaAgenteUseCase — memoriaActiva=false (E3)', () => {
  const OBSERVACIONES_OPT_OUT: ObservacionDestilada[] = [
    { tipo: 'hecho_cliente', titulo: 'Rubro minería', contenido: 'Trabaja en minería.', pinear: false },
  ];

  it('salta el recall de memoria Y la destilación, pero NO el recall de KB', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ memoriaActiva: false }),
      observaciones: OBSERVACIONES_OPT_OUT,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA);

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.conocimiento.consultas).toEqual([CONSULTA]);
    expect(fakes.memoria.contextos).toEqual([]);
    expect(fakes.memoria.busquedas).toEqual([]);
    expect(fakes.generador.entradasDestilar).toEqual([]);
    expect(fakes.memoria.guardadas).toEqual([]);
    expect(fakes.memoria.pineadas).toEqual([]);
  });

  it('memoriaActiva=false en la ruta indicación: la respuesta sale igual, sin memoria', async () => {
    const fakes = crearFakes({
      conversacion: conversacionActiva({ estado: 'REQUIERE_HUMANO', memoriaActiva: false }),
      respuesta: { scoreConfianza: 0.2 },
      observaciones: OBSERVACIONES_OPT_OUT,
    });

    const resultado = await fakes.useCase.ejecutar(1, AHORA, { indicacionHumana: 'Respondé y cerrá' });

    expect(resultado.resultado).toBe('RESPONDIDO');
    expect(fakes.memoria.contextos).toEqual([]);
    expect(fakes.memoria.busquedas).toEqual([]);
    expect(fakes.memoria.guardadas).toEqual([]);
    expect(fakes.conocimiento.consultas).toEqual([CONSULTA]);
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
