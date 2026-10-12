import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type { MensajeCrm } from '../domain/entities';
import type {
  ConocimientoCrmRepository,
  ConversacionCrmRepository,
  MensajeCrmRepository,
} from '../domain/ports';

import { extraerTerminosRecall } from './recuperarTerminos';

/**
 * MarcarRespuestaDeficienteUseCase (agente-ia-crm E4·T5) — the operator
 * flags an IA reply as DEFICIENT: the client question it failed to
 * answer becomes a KB-gap candidate for the E5 curator and the message
 * carries the `deficiente` flag for the thread UI and the E4·T6 panel.
 *
 * Order of operations (aplicarIndicacion shape — validations FIRST,
 * then the writes; the only multi-write precedent available to use
 * cases over these ports is that module's sequential CORE writes,
 * because the ports carry no transaction handle):
 *
 * 1. Load the mensaje (typed 404 — MensajeNoEncontradoError) and
 *    verify it belongs to THIS conversation (mismatch → same 404: a
 *    mensaje of another thread is, for this caller, nonexistent).
 * 2. Only IA replies are markable (typed 400 — plain ValidationError).
 * 3. Already marked → typed 409 MensajeYaMarcadoError carrying the
 *    EXISTING hueco id when the optional read capability resolves it
 *    (a re-mark NEVER stacks a second hueco).
 * 4. Find the LAST CLIENTE (IN) message BEFORE the IA reply in the
 *    hilo (newest-first page walk with the exclusive cursor, motor
 *    cargarHilo precedent — the answer is recent, but old threads
 *    must still resolve). None → typed 422 SinConsultaPreviaError
 *    (an IA greeting with no client ask has nothing to recover).
 * 5. crearHueco — CORE: consulta = the IN body trimmed, terminos =
 *    extraerTerminosRecall (the SAME terms the RAG prefilter ran),
 *    estado ABIERTO, origenMensajeId = the flagged reply. Failure
 *    throws BEFORE the flag: no half-marked replies.
 * 6. marcarDeficiente — CORE: the flag flips only after the hueco
 *    exists (the flag's UI promise is "hay un hueco de esto").
 * 7. registrarActividad — BEST-EFFORT bandeja tick (motor step 11
 *    pattern): a lost tick never lies about the mark.
 *
 * Optional capabilities (crearHueco/actualizarModo precedent): a repo
 * WITHOUT the E4 methods fails LOUDLY instead of silently
 * half-marking. Logs carry ids/codes only — consulta bodies are PII.
 */

/** Thread page size for the consulta lookup (hilo precedent: 50). */
const LIMITE_PAGINA_HILO = 50;

/** Typed 404: the mensaje doesn't exist or belongs to another thread. */
export class MensajeNoEncontradoError extends NotFoundError {
  constructor() {
    super('El mensaje no existe o no pertenece a la conversación');
    this.name = 'MensajeNoEncontradoError';
  }
}

/**
 * Typed 409: the reply was already marked — the existing hueco id
 * rides along when the knowledge repo can resolve it (null otherwise).
 */
export class MensajeYaMarcadoError extends ConflictError {
  readonly huecoId: number | null;

  constructor(huecoId: number | null) {
    super('La respuesta ya fue marcada como deficiente');
    this.name = 'MensajeYaMarcadoError';
    this.huecoId = huecoId;
  }
}

/** Typed 422: no CLIENTE (IN) message exists BEFORE the IA reply. */
export class SinConsultaPreviaError extends ValidationError {
  constructor() {
    super('No hay una consulta previa del cliente para marcar como hueco');
    this.name = 'SinConsultaPreviaError';
  }
}

export interface MarcarRespuestaDeficienteEntrada {
  conversacionId: number;
  mensajeId: number;
  /** Acting session user (audit/log context — the bandeja tick has no text). */
  usuarioId: string;
  /** Display name of the acting operator when the session carries one. */
  usuarioNombre?: string;
}

export interface ResultadoMarcarDeficiente {
  /** The KB-gap candidate the flagged reply left behind. */
  huecoId: number;
  /** The flagged IA reply. */
  mensajeId: number;
}

export interface MarcarRespuestaDeficienteDeps {
  /** Bandeja tick only (best-effort) — the conversation-domain activity primitive. */
  conversaciones: Pick<ConversacionCrmRepository, 'registrarActividad'>;
  /** Las capacidades E4 (obtenerPorId/marcarDeficiente) son OPCIONALES en el puerto. */
  mensajes: Pick<
    MensajeCrmRepository,
    'listarPorConversacion' | 'obtenerPorId' | 'marcarDeficiente'
  >;
  conocimiento: Pick<ConocimientoCrmRepository, 'crearHueco' | 'obtenerHuecoPorMensaje'>;
}

export class MarcarRespuestaDeficienteUseCase {
  constructor(private readonly deps: MarcarRespuestaDeficienteDeps) {}

  async ejecutar(entrada: MarcarRespuestaDeficienteEntrada): Promise<ResultadoMarcarDeficiente> {
    const { conversacionId, mensajeId } = entrada;

    // Capacidades E4 del repo de mensajes (opcional en el puerto):
    // sin ellas no hay marca parcial posible — error RUIDOSO
    // (aplicarIndicacion precedent). El Pick de deps las trae como
    // opcionales: se leen del propio repo para correrlas bound.
    const obtenerPorId = this.deps.mensajes.obtenerPorId;
    if (obtenerPorId === undefined) {
      throw new Error(
        'marcarRespuestaDeficiente requiere un repositorio con obtenerPorId (capacidad E4)',
      );
    }
    const marcarDeficiente = this.deps.mensajes.marcarDeficiente;
    if (marcarDeficiente === undefined) {
      throw new Error(
        'marcarRespuestaDeficiente requiere un repositorio con marcarDeficiente (capacidad E4)',
      );
    }

    // 1. El mensaje debe existir Y pertenecer a esta conversación
    //    (otro hilo ⇒ para este llamado, inexistente: 404 tipado).
    const mensaje = await obtenerPorId.call(this.deps.mensajes, mensajeId);
    if (mensaje === null || mensaje.conversacionId !== conversacionId) {
      throw new MensajeNoEncontradoError();
    }

    // 2. Solo se marcan respuestas de la IA (el cliente y el operador
    //    no producen huecos de KB).
    if (mensaje.emisor !== 'IA') {
      throw new ValidationError('Solo las respuestas de la IA pueden marcarse como deficientes');
    }

    // 3. Idempotencia de negocio: re-marcar JAMÁS apila un segundo
    //    hueco — 409 tipado con el hueco existente cuando se puede
    //    resolver (capacidad opcional del repo de conocimiento).
    if (mensaje.deficiente === true) {
      const obtenerHueco = this.deps.conocimiento.obtenerHuecoPorMensaje;
      const huecoExistente =
        obtenerHueco === undefined
          ? null
          : await obtenerHueco.call(this.deps.conocimiento, mensajeId);
      throw new MensajeYaMarcadoError(huecoExistente?.id ?? null);
    }

    // 4. La última consulta del cliente ANTES de la respuesta.
    const consulta = await this.buscarConsultaPrevia(conversacionId, mensajeId);
    if (consulta === null) throw new SinConsultaPreviaError();

    // 5. Hueco de conocimiento (CORE): lo que la respuesta no supo
    //    contestar, con los MISMOS términos del prefilter RAG. La
    //    capacidad es opcional en el puerto — ausente ⇒ error ruidoso
    //    (nunca una marca sin hueco: la UI promete "esto dejó hueco").
    const crearHueco = this.deps.conocimiento.crearHueco;
    if (crearHueco === undefined) {
      throw new Error(
        'marcarRespuestaDeficiente requiere un repositorio con crearHueco (capacidad E3/E4)',
      );
    }
    const recortada = consulta.trim();
    const hueco = await crearHueco.call(this.deps.conocimiento, {
      consulta: recortada,
      terminos: extraerTerminosRecall(recortada),
      estado: 'ABIERTO',
      origenMensajeId: mensajeId,
    });

    // 6. La marca (CORE): solo después de que el hueco existe.
    const marcado = await marcarDeficiente.call(this.deps.mensajes, mensajeId);
    if (marcado === null) {
      // Carrera: el mensaje desapareció entre la lectura y la marca.
      throw new MensajeNoEncontradoError();
    }

    // 7. Bandeja tick (BEST-EFFORT, motor step 11 pattern): la
    //    conversación sube en la bandeja; un tick perdido nunca miente
    //    sobre la marca. (El dominio de conversaciones no tiene un log
    //    de actividades con texto — el registro durable de esta acción
    //    es el par fila deficiente + hueco #id.)
    try {
      await this.deps.conversaciones.registrarActividad(conversacionId, 'OUT');
    } catch (errorActividad) {
      console.error('[marcarRespuestaDeficiente] registrar actividad falló', {
        conversacionId,
        mensajeId,
        huecoId: hueco.id,
        usuarioId: entrada.usuarioId,
        error: errorActividad instanceof Error ? errorActividad.name : 'ERROR_DESCONOCIDO',
      });
    }

    return { huecoId: hueco.id, mensajeId };
  }

  /**
   * Newest-first page walk (motor cargarHilo precedent): the FIRST
   * CLIENTE (IN) row with id < mensajeId is the LAST client ask
   * before the reply. The exclusive cursor starts AT the flagged id,
   * so only rows BEFORE the reply are ever inspected.
   */
  private async buscarConsultaPrevia(
    conversacionId: number,
    mensajeId: number,
  ): Promise<string | null> {
    let antesDeId: number | undefined = mensajeId;
    for (;;) {
      const opciones =
        antesDeId === undefined
          ? { limite: LIMITE_PAGINA_HILO }
          : { limite: LIMITE_PAGINA_HILO, antesDeId };
      const pagina = await this.deps.mensajes.listarPorConversacion(conversacionId, opciones);
      const previa = pagina.find(esMensajeCliente);
      if (previa !== undefined) return previa.cuerpo;
      if (pagina.length < LIMITE_PAGINA_HILO) return null;
      const ultima = pagina.at(-1);
      if (ultima === undefined) return null;
      antesDeId = ultima.id;
    }
  }
}

/** The client ask: IN dirección + CLIENTE emisor (motor disparador precedent). */
function esMensajeCliente(mensaje: MensajeCrm): boolean {
  return mensaje.direccion === 'IN' && mensaje.emisor === 'CLIENTE';
}
