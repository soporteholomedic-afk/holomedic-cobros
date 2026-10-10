import { NotFoundError, ValidationError } from '../domain/errors';
import type { ConversacionListada } from '../domain/entities';
import type { ConversacionCrmRepository } from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the bandeja use cases share ONE typed 404 for the
// conversation row (importers get it from either use case).
export { ConversacionNoEncontradaError };

/**
 * VincularConversacionUseCase (agente-ia-crm E1) — resolve a
 * conversation to the registry: asociar an EXISTING contacto (its
 * empresaId is resolved from the contacto itself — never trusted
 * from the request) or CREATE the contacto first (nombreNormalizado
 * derived by the adapter) and then link. The vincular write also
 * moves the conversation to TOMADA_HUMANO (an operator just acted).
 * Re-vincular is ALLOWED by design: it is the operator-correction
 * path (cambia el contacto de una conversación ya vinculada).
 */

/** Typed 404 when modo asociar names a contacto that does not exist. */
export class ContactoNoEncontradoError extends NotFoundError {
  constructor() {
    super('Contacto no encontrado');
    this.name = 'ContactoNoEncontradoError';
  }
}

/** Typed 400 when the entrada lacks what its modo requires. */
export class VinculacionInvalidaError extends ValidationError {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'VinculacionInvalidaError';
  }
}

export interface NuevoContactoVinculacion {
  empresaId: number;
  nombre: string;
  cargo?: string | null;
}

export interface VincularConversacionEntrada {
  conversacionId: number;
  modo: 'asociar' | 'crear';
  /** modo asociar: REQUIRED (la empresa se resuelve desde el contacto). */
  contactoId?: number;
  /** Ignorado en asociar (fuente de verdad = el contacto); aceptado por
   * compatibilidad de payload de la vista. */
  empresaId?: number;
  /** modo crear: REQUIRED. */
  nuevoContacto?: NuevoContactoVinculacion;
}

export interface VincularConversacionDeps {
  conversaciones: ConversacionCrmRepository;
}

export class VincularConversacionUseCase {
  constructor(private readonly deps: VincularConversacionDeps) {}

  async ejecutar(entrada: VincularConversacionEntrada): Promise<ConversacionListada> {
    // La conversación se valida ANTES de crear cualquier contacto: un
    // 404 no debe dejar contactos huérfanos.
    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    let contactoId: number;
    let contactoNombre: string | null;
    let razonSocial: string | null;
    let empresaId: number;

    if (entrada.modo === 'asociar') {
      if (entrada.contactoId === undefined || !Number.isInteger(entrada.contactoId)) {
        throw new VinculacionInvalidaError('modo asociar requiere contactoId');
      }
      const contacto = await this.deps.conversaciones.obtenerContactoPorId(entrada.contactoId);
      if (contacto === null) throw new ContactoNoEncontradoError();
      contactoId = contacto.contactoId;
      contactoNombre = contacto.nombreContacto;
      razonSocial = contacto.razonSocial;
      empresaId = contacto.empresaId;
    } else {
      const nuevo = entrada.nuevoContacto;
      if (
        nuevo === undefined ||
        !Number.isInteger(nuevo.empresaId) ||
        typeof nuevo.nombre !== 'string' ||
        nuevo.nombre.trim() === ''
      ) {
        throw new VinculacionInvalidaError('modo crear requiere nuevoContacto {empresaId, nombre}');
      }
      const creado = await this.deps.conversaciones.crearContacto(nuevo.empresaId, {
        nombre: nuevo.nombre.trim(),
        cargo: nuevo.cargo ?? null,
      });
      contactoId = creado.contactoId;
      contactoNombre = nuevo.nombre.trim();
      razonSocial = null;
      empresaId = nuevo.empresaId;
    }

    // La escritura única de vinculación: registro + TOMADA_HUMANO (un
    // operador acaba de intervenir). Re-vincular sobreescribe.
    const vinculada = await this.deps.conversaciones.vincular(entrada.conversacionId, {
      empresaId,
      contactoId,
      estado: 'TOMADA_HUMANO',
    });
    if (vinculada === null) throw new ConversacionNoEncontradaError();

    return { ...vinculada, razonSocial, nombreContacto: contactoNombre };
  }
}
