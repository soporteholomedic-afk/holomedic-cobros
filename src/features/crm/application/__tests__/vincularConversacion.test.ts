import { describe, expect, it } from 'vitest';

import type {
  BuscarConversacionCanal,
  CandidatoVinculacion,
  ConversacionCrmRepository,
  ContactoConEmpresa,
} from '../../domain/ports';
import type {
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
} from '../../domain/entities';
import { normalizarNombre } from '../../domain/normalizar';
import {
  ConversacionNoEncontradaError,
  ContactoNoEncontradoError,
  VincularConversacionUseCase,
  type VincularConversacionEntrada,
} from '../vincularConversacion';

/**
 * Use-case contract for the operator vinculación (agente-ia-crm E1):
 * resolve a PENDIENTE_VINCULACION conversation to an empresa/contacto —
 * asociar an EXISTING contacto (empresaId resolved from the contacto,
 * never trusted from the request) or CREATE a new one first. Pinned:
 * - asociar: vincular(id, {empresaId del contacto, contactoId,
 *   estado: 'TOMADA_HUMANO'}) → returns the re-read row widened to
 *   ConversacionListada (razonSocial + nombreContacto del contacto).
 * - crear: crearContacto runs FIRST (nombre normalizado, cargo), then
 *   the same vincular write with the new contactoId.
 * - Contacto inexistente / conversación inexistente → typed errors.
 * - Re-vincular IS allowed (operator correction: changes the contacto).
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

function crearSuite(): { fake: FakeConversaciones; useCase: VincularConversacionUseCase } {
  const fake = new FakeConversaciones();
  fake.sembrar(conversacionPendiente());
  const useCase = new VincularConversacionUseCase({ conversaciones: fake });
  return { fake, useCase };
}

describe('VincularConversacionUseCase — vinculación operador (E1)', () => {
  it('asociar: resuelve la empresa desde el contacto y vincula con estado TOMADA_HUMANO', async () => {
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
      { id: 1, datos: { empresaId: 7, contactoId: 42, estado: 'TOMADA_HUMANO' } },
    ]);
    expect(conversacion).toMatchObject({
      id: 1,
      empresaId: 7,
      contactoId: 42,
      estado: 'TOMADA_HUMANO',
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
      { id: 1, datos: { empresaId: 9, contactoId: 100, estado: 'TOMADA_HUMANO' } },
    ]);
    expect(conversacion).toMatchObject({ empresaId: 9, contactoId: 100, estado: 'TOMADA_HUMANO' });
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
});
