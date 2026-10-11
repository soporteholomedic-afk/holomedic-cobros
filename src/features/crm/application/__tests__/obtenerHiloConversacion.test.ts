import { describe, expect, it } from 'vitest';

import type {
  CandidatoVinculacion,
  ConversacionCrmRepository,
  ContactoConEmpresa,
  ListarMensajesOpciones,
  MensajeCrmRepository,
} from '../../domain/ports';
import type {
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  MensajeCrm,
  SolicitudAyuda,
} from '../../domain/entities';
import {
  ConversacionNoEncontradaError,
  ObtenerHiloConversacionUseCase,
} from '../obtenerHiloConversacion';

/**
 * Use-case contract for the bandeja hilo read (agente-ia-crm E1).
 * Hexagonal: exercised against the PORTS with in-memory fakes. Pinned
 * here (E1 advisories R3-hilo-sin-cobertura / R4-hilo-read-write-coupling):
 * - happy path: devuelve la conversación + el hilo oldest-first (el
 *   port pagina newest-first, el use case lo invierte) y consume el
 *   badge (marcarMensajesLeidos) cuando noLeidos > 0;
 * - noLeidos = 0 → NINGUNA escritura (re-abrir un hilo ya leído no
 *   debe disparar un UPDATE inútil en cada lectura);
 * - conversación inexistente → ConversacionNoEncontradaError tipado
 *   (el route lo mapea a 404);
 * - los errores del repositorio propagan sin traducir.
 */

class FakeConversaciones implements ConversacionCrmRepository {
  filas: ConversacionCrm[] = [];
  /** Espía: ids con los que se disparó marcarMensajesLeidos. */
  marcadasLeidas: number[] = [];
  falloObtener: Error | null = null;
  falloMarcarLeidos: Error | null = null;

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
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
    if (this.falloObtener !== null) throw this.falloObtener;
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async buscarPorCanal(): Promise<ConversacionCrm | null> {
    throw new Error('no requerido en este fake');
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

  async marcarMensajesLeidos(id: number): Promise<void> {
    if (this.falloMarcarLeidos !== null) throw this.falloMarcarLeidos;
    this.marcadasLeidas.push(id);
  }

  async registrarActividad(): Promise<void> {
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
}

class FakeMensajes implements MensajeCrmRepository {
  filas: MensajeCrm[] = [];
  /** Espía: opciones con las que el use case pidió cada página. */
  consultas: ListarMensajesOpciones[] = [];
  falloListar: Error | null = null;

  sembrar(fila: MensajeCrm): void {
    this.filas.push(fila);
  }

  async crear(): Promise<MensajeCrm> {
    throw new Error('no requerido en este fake');
  }

  async actualizarEnvio(): Promise<MensajeCrm | null> {
    throw new Error('no requerido en este fake');
  }

  async existePorIdempotenciaKey(): Promise<boolean> {
    return false;
  }

  /** Contrato del port: pagina newest-first (id DESC), respeta limite y cursor. */
  async listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]> {
    if (this.falloListar !== null) throw this.falloListar;
    this.consultas.push(structuredClone(opciones));
    let pagina = this.filas.filter((f) => f.conversacionId === conversacionId);
    const cursor = opciones.antesDeId;
    if (cursor !== undefined) {
      pagina = pagina.filter((f) => f.id < cursor);
    }
    return [...pagina]
      .sort((a, b) => b.id - a.id)
      .slice(0, opciones.limite)
      .map((f) => structuredClone(f));
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
    noLeidos: 3,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

function mensajeBase(sobres: Partial<MensajeCrm> = {}): MensajeCrm {
  return {
    id: 1,
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
  };
}

function crearSuite(conversacion: ConversacionCrm | null = conversacionBase()): {
  conversaciones: FakeConversaciones;
  mensajes: FakeMensajes;
  useCase: ObtenerHiloConversacionUseCase;
} {
  const conversaciones = new FakeConversaciones();
  if (conversacion !== null) conversaciones.sembrar(conversacion);
  const mensajes = new FakeMensajes();
  const useCase = new ObtenerHiloConversacionUseCase({ conversaciones, mensajes });
  return { conversaciones, mensajes, useCase };
}

describe('ObtenerHiloConversacionUseCase — lectura del hilo de la bandeja (E1)', () => {
  it('happy path: devuelve conversación + mensajes oldest-first y consume el badge (noLeidos > 0)', async () => {
    const { mensajes, conversaciones, useCase } = crearSuite();
    mensajes.sembrar(mensajeBase({ id: 1, cuerpo: 'Hola, necesito un turno' }));
    mensajes.sembrar(mensajeBase({ id: 2, direccion: 'OUT', emisor: 'HUMANO', cuerpo: 'Claro, ¿para cuándo?', estadoEnvio: 'ENVIADO', wamid: 'wamid.A1' }));
    mensajes.sembrar(mensajeBase({ id: 3, cuerpo: 'Para el viernes' }));

    const hilo = await useCase.ejecutar(1);

    expect(hilo.conversacion).toEqual(conversaciones.filas[0]);
    expect(hilo.mensajes.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(mensajes.consultas).toEqual([{ limite: 50 }]);
    expect(conversaciones.marcadasLeidas).toEqual([1]);
  });

  it('noLeidos = 0 → NO dispara marcarMensajesLeidos (cero escrituras en la re-lectura)', async () => {
    const { mensajes, conversaciones, useCase } = crearSuite(conversacionBase({ noLeidos: 0 }));
    mensajes.sembrar(mensajeBase({ id: 1 }));

    const hilo = await useCase.ejecutar(1);

    expect(hilo.mensajes).toHaveLength(1);
    expect(conversaciones.marcadasLeidas).toEqual([]);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { mensajes, conversaciones, useCase } = crearSuite(null);

    await expect(useCase.ejecutar(99)).rejects.toThrow(ConversacionNoEncontradaError);
    await expect(useCase.ejecutar(99)).rejects.toThrow('Conversación no encontrada');
    expect(mensajes.consultas).toEqual([]);
    expect(conversaciones.marcadasLeidas).toEqual([]);
  });

  it('los errores del repositorio propagan sin traducir', async () => {
    const falloLeer = new Error('db caída al leer la conversación');
    const falloPaginar = new Error('db caída al paginar el hilo');

    const suiteLeer = crearSuite();
    suiteLeer.conversaciones.falloObtener = falloLeer;
    await expect(suiteLeer.useCase.ejecutar(1)).rejects.toThrow(falloLeer);

    const suitePaginar = crearSuite();
    suitePaginar.mensajes.falloListar = falloPaginar;
    await expect(suitePaginar.useCase.ejecutar(1)).rejects.toThrow(falloPaginar);
  });
});

describe('ObtenerHiloConversacionUseCase — solicitudAyuda (E3·T3, extensión aditiva)', () => {
  const SOLICITUD: SolicitudAyuda = {
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
  };

  it('con una solicitud PENDIENTE viaja con el hilo (la bandera de indicación del bandeja)', async () => {
    const mensajes = new FakeMensajes();
    mensajes.sembrar(mensajeBase({ id: 1 }));
    const repo = Object.assign(new FakeConversaciones(), {
      // Capacidad E3 presente: el método existe en el repo real.
      obtenerSolicitudAyudaPendiente: async (): Promise<SolicitudAyuda> =>
        structuredClone(SOLICITUD),
    });
    repo.sembrar(conversacionBase());
    const useCaseConSolicitud = new ObtenerHiloConversacionUseCase({
      conversaciones: repo,
      mensajes,
    });

    const hilo = await useCaseConSolicitud.ejecutar(1);

    expect(hilo.solicitudAyuda).toEqual(SOLICITUD);
    expect(hilo.mensajes.map((m) => m.id)).toEqual([1]);
  });

  it('capacidad presente pero SIN pendiente → solicitudAyuda null (nada que indicar)', async () => {
    const mensajes = new FakeMensajes();
    mensajes.sembrar(mensajeBase({ id: 1 }));
    const repo = Object.assign(new FakeConversaciones(), {
      obtenerSolicitudAyudaPendiente: async (): Promise<SolicitudAyuda | null> => null,
    });
    repo.sembrar(conversacionBase());
    const useCase = new ObtenerHiloConversacionUseCase({
      conversaciones: repo,
      mensajes,
    });

    const hilo = await useCase.ejecutar(1);

    expect(hilo.solicitudAyuda).toBeNull();
  });

  it('repo sin la capacidad (pre-E3) → solicitudAyuda null, sin romper el contrato del hilo', async () => {
    const { mensajes, useCase } = crearSuite();
    mensajes.sembrar(mensajeBase({ id: 1 }));

    const hilo = await useCase.ejecutar(1);

    expect(hilo.solicitudAyuda).toBeNull();
  });
});
