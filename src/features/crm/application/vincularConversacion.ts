import { NotFoundError, ValidationError } from '../domain/errors';
import type { ConversacionListada } from '../domain/entities';
import type {
  ConversacionCrmRepository,
  MensajeCrmRepository,
  TareaAgenteRepository,
} from '../domain/ports';

import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the bandeja use cases share ONE typed 404 for the
// conversation row (importers get it from either use case).
export { ConversacionNoEncontradaError };

/**
 * VincularConversacionUseCase (agente-ia-crm E1 + E2·T5) — resolve a
 * conversation to the registry: asociar an EXISTING contacto (its
 * empresaId is resolved from the contacto itself — never trusted
 * from the request) or CREATE the contacto first (nombreNormalizado
 * derived by the adapter) and then link. The vincular write moves
 * the conversation to ACTIVA_IA + modo 'IA' (E2 decision:
 * conversations are born IA-managed — the operator resolved WHO the
 * client is; la Guía takes it from there), and ONE GENERAR_RESPUESTA
 * task is enqueued for the most recent IN/CLIENTE message so the
 * pending client message does not wait for the next inbound one.
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
  /**
   * Thread read for the E2·T5 task hook (most recent IN/CLIENTE
   * message). Optional (guardarContactoOperativo precedent): the SQL
   * container always provides it; pre-E2 constructions stay valid
   * and simply skip the hook.
   */
  mensajes?: MensajeCrmRepository;
  /** Agent-task queue for the E2·T5 hook (same optional rule). */
  tareas?: TareaAgenteRepository;
}

/** Thread page size for the trigger lookup (hilo precedent: 50). */
const LIMITE_PAGINA_HILO = 50;

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

    // La escritura única de vinculación: registro + ACTIVA_IA (E2:
    // nace gestionada por la Guía). Re-vincular sobreescribe.
    const vinculada = await this.deps.conversaciones.vincular(entrada.conversacionId, {
      empresaId,
      contactoId,
      estado: 'ACTIVA_IA',
    });
    if (vinculada === null) throw new ConversacionNoEncontradaError();

    // El puerto de vincular no lleva modo: el flip es una escritura
    // propia (actualizarModo, opcional en el puerto — el adaptador
    // SQL siempre lo implementa; sin la capacidad se omite).
    if (this.deps.conversaciones.actualizarModo !== undefined) {
      await this.deps.conversaciones.actualizarModo(entrada.conversacionId, 'IA');
    }

    // E2·T5: el mensaje IN pendiente que motivó la vinculación no
    // debe esperar al PRÓXIMO inbound — una tarea GENERAR_RESPUESTA
    // por el IN/CLIENTE más reciente (idempotente por triple;
    // DESPUÉS del flip de estado para que un barredor ansioso no la
    // complete como CONVERSACION_NO_ACTIVA_IA).
    if (this.deps.mensajes !== undefined && this.deps.tareas !== undefined) {
      const hilo = await this.deps.mensajes.listarPorConversacion(entrada.conversacionId, {
        limite: LIMITE_PAGINA_HILO,
      });
      const disparador = hilo.find(
        (mensaje) => mensaje.direccion === 'IN' && mensaje.emisor === 'CLIENTE',
      );
      if (disparador !== undefined) {
        await this.deps.tareas.crearSiNoExiste({
          conversacionId: entrada.conversacionId,
          mensajeId: disparador.id,
          tipo: 'GENERAR_RESPUESTA',
        });
      }
    }

    return { ...vinculada, razonSocial, nombreContacto: contactoNombre };
  }
}
