import { normalizarTelefonoE164 } from '../domain/normalizar';
import type { CrearMensajeInput, MensajeCrm } from '../domain/entities';
import type { ConversacionCrmRepository, MensajeCrmRepository } from '../domain/ports';

/**
 * Ingest of one `whatsapp.message.received` event (agente-ia-crm T2)
 * — the pipeline the Kapso webhook and the E1 simulator share:
 * dedup → route to a conversation (vincular when exactly one contact
 * matches) → persist the IN message → tick the bandeja counters.
 * Transport concerns (HMAC, raw body, batching) stay in the route.
 */

/** The Kapso payload (snake_case verbatim) once it passed the guard. */
export interface MensajeWhatsappRecibido {
  phone_number_id?: string;
  message: {
    /** wamid — required, also the idempotency fallback key. */
    id: string;
    /** Unix seconds as a string (Kapso/Meta convention). */
    timestamp: string;
    /** WhatsApp payload type ('text', 'audio', 'image', …). */
    type: string;
    /** International digits WITHOUT '+' ('595981234567'); OPTIONAL —
     * Kapso BSUID payloads may lack every usable identifier. */
    from?: string;
    /** Kapso channel-scoped user id ('US.…'); optional (BSUID). */
    from_user_id?: string;
    username?: string;
    text?: { body?: string };
    kapso?: { direction?: string; status?: string };
  };
}

/** Narrowing guard: no zod — manual unknown → MensajeWhatsappRecibido. */
export function esMensajeWhatsappRecibido(v: unknown): v is MensajeWhatsappRecibido {
  if (typeof v !== 'object' || v === null) return false;
  const mensaje = (v as { message?: unknown }).message;
  if (typeof mensaje !== 'object' || mensaje === null) return false;
  const m = mensaje as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id === '') return false;
  if (typeof m.timestamp !== 'string') return false;
  if (typeof m.type !== 'string') return false;
  if (m.from !== undefined && typeof m.from !== 'string') return false;
  if (m.from_user_id !== undefined && typeof m.from_user_id !== 'string') return false;
  if (m.text !== undefined) {
    if (typeof m.text !== 'object' || m.text === null) return false;
    const body = (m.text as { body?: unknown }).body;
    if (body !== undefined && typeof body !== 'string') return false;
  }
  return true;
}

/** Use-case input: the guarded payload plus the resolved dedup key. */
export interface MensajeEntranteWhatsapp {
  /** X-Idempotency-Key header (or wamid fallback) — the dedup key. */
  idempotenciaKey: string;
  message: MensajeWhatsappRecibido['message'];
}

/** CRM_Mensajes.cuerpo es NVARCHAR(4000): techo de caracteres del cuerpo. */
const CUERPO_MAX_CARACTERES = 4000;
/** Marcador visible del corte explícito (12 caracteres → 3988 + 12 = 4000). */
const MARCA_TRUNCADO = '…[truncado]';

/**
 * R3 cuerpo-truncado-silencioso: un cuerpo IN que excede el techo de
 * NVARCHAR(4000) se trunca EXPLÍCITO con un marcador visible en vez
 * de perder el final en silencio (o reventar el INSERT).
 */
function acotarCuerpo(cuerpo: string): string {
  if (cuerpo.length <= CUERPO_MAX_CARACTERES) return cuerpo;
  return cuerpo.slice(0, CUERPO_MAX_CARACTERES - MARCA_TRUNCADO.length) + MARCA_TRUNCADO;
}

export interface ResultadoProcesarMensaje {
  /** The conversation used/created (null on the duplicate early-out). */
  conversacionId: number | null;
  /** The persisted CRM_Mensajes id (null on the duplicate early-out). */
  mensajeId: number | null;
  /** true when the conversation ended up with empresaId + contactoId. */
  vinculado: boolean;
  /** true when the idempotenciaKey was already seen (nothing written). */
  duplicado: boolean;
}

export interface ProcesarMensajeWhatsappDeps {
  conversaciones: ConversacionCrmRepository;
  mensajes: MensajeCrmRepository;
}

export class ProcesarMensajeWhatsappUseCase {
  constructor(private readonly deps: ProcesarMensajeWhatsappDeps) {}

  async ejecutar(evento: MensajeEntranteWhatsapp): Promise<ResultadoProcesarMensaje> {
    // 1. Dedup early: a seen key never re-routes nor re-writes (the
    //    filtered unique index remains the race backstop for the
    //    window between this check and the insert).
    if (await this.deps.mensajes.existePorIdempotenciaKey(evento.idempotenciaKey)) {
      return { conversacionId: null, mensajeId: null, vinculado: false, duplicado: true };
    }

    const { message } = evento;
    // 2. Canal keys: E.164 from the WhatsApp `from` (may normalize to
    //    null) and the Kapso user id — BOTH optional (BSUID payloads).
    const telefono = message.from !== undefined ? normalizarTelefonoE164(message.from) : null;
    const identificadorCanal = message.from_user_id ?? null;

    // 3. Route: reuse the existing conversation (phone key first, then
    //    the channel user id as fallback so a BSUID-born thread is
    //    never duplicated when the phone shows up later); otherwise
    //    create — vinculado TOMADA_HUMANO when EXACTLY ONE contact
    //    matches, PENDIENTE_VINCULACION otherwise (0, >1 or no phone).
    let conversacion =
      telefono !== null
        ? await this.deps.conversaciones.buscarPorCanal('WHATSAPP', { telefono })
        : null;
    if (!conversacion && identificadorCanal !== null) {
      conversacion = await this.deps.conversaciones.buscarPorCanal('WHATSAPP', {
        identificadorCanal,
      });
    }
    if (!conversacion) {
      if (telefono !== null) {
        const candidatos = await this.deps.conversaciones.buscarCandidatosVinculacion(telefono);
        if (candidatos.length === 1) {
          conversacion = await this.deps.conversaciones.crear({
            canal: 'WHATSAPP',
            telefono,
            identificadorCanal,
            empresaId: candidatos[0].empresaId,
            contactoId: candidatos[0].contactoId,
            estado: 'TOMADA_HUMANO',
            modo: 'HUMANO',
            asignadaA: null,
          });
        }
      }
      if (!conversacion) {
        // Sin teléfono identificable también cae aquí (telefono e
        // identificadorCanal null): el índice único filtrado tolera
        // NULL y la vista de vinculación (T5) la resuelve después.
        conversacion = await this.deps.conversaciones.crear({
          canal: 'WHATSAPP',
          telefono,
          identificadorCanal,
          estado: 'PENDIENTE_VINCULACION',
        });
      }
    }

    // 4. Body: text with a non-empty body verbatim; any other shape is
    //    a MEDIA placeholder `[type]` (cuerpo is NOT NULL in the DDL).
    const cuerpoTexto = message.type === 'text' ? message.text?.body : undefined;
    const esTexto = typeof cuerpoTexto === 'string' && cuerpoTexto !== '';

    // 5. Persist the IN message (CLIENTE emisor; estadoEnvio null = IN).
    // Race backstop: dos deliveries de la misma clave pasan ambos el
    // dedup y pierden solo acá — el índice único (2601/2627) rechaza
    // al perdedor → duplicado SIN re-bump del contador (registrarActividad
    // queda después del insert). Otro error se propaga → 503 → retry.
    const nuevoMensaje: CrearMensajeInput = {
      conversacionId: conversacion.id,
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: esTexto ? acotarCuerpo(cuerpoTexto) : `[${message.type}]`,
      tipo: esTexto ? 'TEXTO' : 'MEDIA',
      canal: 'WHATSAPP',
      wamid: message.id,
      idempotenciaKey: evento.idempotenciaKey,
      estadoEnvio: null,
    };
    let mensaje: MensajeCrm;
    try {
      mensaje = await this.deps.mensajes.crear(nuevoMensaje);
    } catch (err: unknown) {
      if (!esViolacionIndiceUnico(err)) throw err;
      return { conversacionId: null, mensajeId: null, vinculado: false, duplicado: true };
    }

    // 6. Bandeja counters: ultimoMensajeEn = ahora, noLeidos + 1.
    await this.deps.conversaciones.registrarActividad(conversacion.id);

    return {
      conversacionId: conversacion.id,
      mensajeId: mensaje.id,
      vinculado: conversacion.empresaId !== null && conversacion.contactoId !== null,
      duplicado: false,
    };
  }
}

/** SQL Server unique-index violation on idempotenciaKey: 2601/2627. */
function esViolacionIndiceUnico(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const numero = (err as { number?: unknown }).number;
  return numero === 2601 || numero === 2627;
}
