import type {
  CampoFicha,
  Empresa,
  EstadoConversacion,
  FichaDestilada,
  FragmentoMemoria,
  IdentificacionExtraida,
  MensajeCrm,
  MensajeHistorialGeneracion,
  ObservacionDestilada,
  ObservacionMemoria,
  RespuestaGenerada,
  ResultadoDestilacion,
} from '../domain/entities';
import type {
  ConocimientoCrmRepository,
  ConversacionCrmRepository,
  CrmEmpresaRepositoryPort,
  EnviadorWhatsappCrmPort,
  GeneradorRespuestaPort,
  ListarMensajesOpciones,
  MemoriaConversacionPort,
  MensajeCrmRepository,
} from '../domain/ports';
import {
  crearConfigAgente,
  MAX_HISTORIAL,
  MAX_MEMORIAS_CHAT,
  MAX_MEMORIAS_EMPRESA,
  MAX_MEMORIAS_PINEADOS,
  TOP_K_CONOCIMIENTO,
  TOP_K_MEMORIA,
  type ConfigAgente,
} from './configAgente';
import { PROMPT_VERSION } from './prompt/promptGeneracion';
import { rankearMemorias } from './rankearMemorias';
import { extraerTerminosRecall } from './recuperarTerminos';
import { recuperarConocimiento } from './recuperarConocimiento';
import { sintetizarHilo } from './sintetizarHilo';

/**
 * The AI response engine (agente-ia-crm E2·T4) — la Guía answers one
 * conversation end to end: guardrails (kill switch, business hours,
 * exchange limit) → RAG recall (knowledge + memory) → PII-scrubbed
 * generation → confidence decision → outbox-lite WhatsApp send
 * (mirrors responderConversacion: persist PENDIENTE → send → confirm
 * ENVIADO/FALLIDO → registrarActividad best-effort) → post-send
 * distillation into the conversation memory.
 *
 * State machine: ACTIVA_IA → (answer) ACTIVA_IA | (escalate: score
 * below umbral, enScope false, requiereAyudaHumana or exchange limit)
 * REQUIERE_HUMANO — the state flip happens ONLY after a successful
 * send. FUERA_DE_HORARIO and AGENTE_DESHABILITADO touch nothing: the
 * message waits and the next window (or a human) picks it up. A send
 * failure returns FALLIDO_ENVIO and ALSO keeps ACTIVA_IA — T5 retries
 * the failed row instead of re-answering (re-answering would burn
 * another LLM call and could double-send).
 *
 * Zero-side-effect no-ops, in guard order: missing conversation,
 * estado not IA-attended, kill switch, out of hours, no phone on the
 * conversation (the responderConversacion SIN_TELEFONO guard — an
 * attended row without its E.164 key has nothing to answer to), and
 * no IN/CLIENTE message to answer. Each returns BEFORE any recall,
 * LLM call or write. The CONVERSACION_NO_ACTIVA_IA result code means
 * exactly "not IA-attended" (missing row, TOMADA_HUMANO, PAUSADA,
 * CERRADA, REQUIERE_HUMANO, sin teléfono or nothing to answer).
 *
 * E2·T9 — unlinked attendance + progressive identification:
 * PENDIENTE_VINCULACION conversations (0 or >1 phone candidates, no
 * empresa/contacto) run the SAME engine: the knowledge recall still
 * fires (KB answers cover early generic questions), the generator
 * gets contactoNuevo:true (its prompt gathers nombre/empresa
 * naturally), memory recall and distillation stay SKIPPED (the
 * memory port requires empresaId) — and AFTER a successful RESPONDIDO
 * send the engine extracts the identification best-effort
 * (generador.extraerIdentificacion). When the stated empresa
 * EXACTLY matches ONE CRM_Empresas row (normalized: trim, lowercase,
 * strip diacritics) it creates the contacto (stated nombre, fallback
 * 'Contacto WhatsApp'), vincula with estado ACTIVA_IA and pins modo
 * IA — mirroring vincularConversacion (repo vincular never touches
 * modo). 0 or >1 exact matches (or the optional empresas dep absent)
 * → nothing: the chat keeps collecting and the operator can still
 * link manually via the E1 panel. Any identification error only
 * warns (id-level logs) — the already-sent answer is the durable
 * truth. An unlinked ESCALADO keeps today's behavior (safe text +
 * REQUIERE_HUMANO, no vinculación side effects).
 *
 * PII: phone numbers are masked with '[teléfono]' ONLY inside the
 * LLM input (consulta + historial + indicación); every persisted,
 * sent and distilled body stays verbatim. Logs never carry bodies —
 * only ids and typed error codes.
 *
 * E3·T2 — help pattern: (a) every ESCALADO outcome now persists the
 * help request (crearSolicitudAyuda, best-effort — never fails the
 * engine, never stacks: skipped when obtenerSolicitudAyudaPendiente
 * already sees one) carrying the consulta that defeated the RAG, the
 * prefilter search terms and the audited score; (b) the new third
 * argument carries `indicacionHumana` — the operator instruction
 * read back from a RESUELTA solicitud by the queue route. The
 * indicación authorizes CONTENT ONLY: the scope/umbral gate is
 * skipped (a human vouched for the answer, so low score / out of
 * scope / even a requiereAyudaHumana flag still ANSWER — the latter
 * warns), REQUIERE_HUMANO conversations are attended again (la Guía
 * retakes the thread after a successful indicación-driven send:
 * estado back to ACTIVA_IA + modo IA), the sent message audit grows
 * the marker {tipo:'indicacion_humana'} on its fuentes JSON, and NO
 * new solicitud is created on an indicación-driven answer. It does
 * NOT open autonomy windows: kill switch, business hours, exchange
 * limit, sin-teléfono and no-IN guards keep running exactly as the
 * plain path (a limit escalation with an indicación still escalates
 * and still persists its solicitud). (c) memoriaActiva=false (the
 * per-conversation privacy opt-out, E3·T1 — undefined ≡ active)
 * skips the Engram recall (contexto + buscar) AND the post-send
 * distillation+pin — and, because the ficha extraction piggybacks
 * that same destilar call (E3·T4), it skips the ficha too: the
 * opt-out is over what la Guía LEARNS from the thread, not just the
 * memory store. The KB recall and the rest of the flow continue.
 */

/** Every terminal outcome of one engine run. */
export type ResultadoMotorAgente =
  | 'RESPONDIDO'
  | 'ESCALADO'
  | 'FUERA_DE_HORARIO'
  | 'AGENTE_DESHABILITADO'
  | 'CONVERSACION_NO_ACTIVA_IA'
  | 'FALLIDO_ENVIO';

/** Engine result: `mensajeId` is the OUT row created (null on no-ops). */
export interface ResultadoAgente {
  conversacionId: number;
  resultado: ResultadoMotorAgente;
  mensajeId: number | null;
  /** The generation's scoreConfianza (null: no-ops and limit escalation). */
  score: number | null;
}

/**
 * Third-argument options for one engine run (E3·T2). The indicación
 * comes from a RESUELTA help request (the queue route re-reads it);
 * it authorizes the CONTENT of the answer, never autonomy windows
 * (see the class docblock). Blank/absent ⇒ the plain E2 path.
 */
export interface OpcionesEjecutarMotor {
  indicacionHumana?: string;
}

/** Constructor dependencies — every port faked in tests (hexagonal). */
export interface GeneradorRespuestaAgenteDeps {
  conversaciones: ConversacionCrmRepository;
  mensajes: MensajeCrmRepository;
  conocimiento: ConocimientoCrmRepository;
  memoria: MemoriaConversacionPort;
  generador: GeneradorRespuestaPort;
  whatsapp: EnviadorWhatsappCrmPort;
  /**
   * E2·T9 progressive identification: the empresa registry the
   * auto-vinculación matches against. OPTIONAL (guardarContacto
   * Operativo precedent) — out-of-surface fakes and older call sites
   * stay valid; without it the engine still attends unlinked
   * conversations, it just cannot auto-vincular.
   */
  empresas?: CrmEmpresaRepositoryPort;
  /** Defaults to crearConfigAgente() (env-derived). */
  config?: ConfigAgente;
}

/** Thread page size for the whole-thread load (hilo precedent: 50). */
const LIMITE_PAGINA_HILO = 50;

/**
 * The ONLY estados the engine attends (E2·T9): linked ACTIVA_IA plus
 * unlinked PENDIENTE_VINCULACION — la Guía answers while the
 * vinculación fills in progressively.
 */
const ESTADOS_ATENDIDOS_IA: ReadonlySet<EstadoConversacion> = new Set([
  'ACTIVA_IA',
  'PENDIENTE_VINCULACION',
]);

/**
 * E3·T2: with an indicación the engine ALSO retakes REQUIERE_HUMANO
 * (the operator resolved the solicitud — la Guía answers again).
 * TOMADA_HUMANO/PAUSADA/CERRADA stay out: a human holding the
 * conversation outranks any indicación.
 */
const ESTADOS_ATENDIDOS_CON_INDICACION: ReadonlySet<EstadoConversacion> = new Set([
  ...ESTADOS_ATENDIDOS_IA,
  'REQUIERE_HUMANO',
]);

/** A digit run shorter than this is not treated as a phone number. */
const MINIMO_DIGITOS_TELEFONO = 8;
/**
 * Phone candidate: optional '+' / '(' lead-in, digits with single
 * separators (spaces, dots, dashes, parens) BETWEEN digits — the match
 * always starts and ends on a digit, so trailing separators stay.
 */
const PATRON_TELEFONO = /\+?\(?\d[\d\s.()-]*\d|\+?\(?\d/g;

/**
 * Mask every phone-looking digit run (>= 8 digits including
 * separators: '+', spaces, dashes, dots, parens) as '[teléfono]' —
 * applied ONLY to the LLM input, never to persisted/sent bodies.
 */
export function enmascararTelefonos(texto: string): string {
  return texto.replace(PATRON_TELEFONO, (coincidencia) => {
    const digitos = coincidencia.match(/\d/g);
    return digitos !== null && digitos.length >= MINIMO_DIGITOS_TELEFONO
      ? '[teléfono]'
      : coincidencia;
  });
}

/** True when the local hour falls OUTSIDE the [desde, hasta) window. */
function esFueraDeHorario(ahora: Date, desde: number, hasta: number): boolean {
  const horaLocal = ahora.getHours();
  if (hasta <= desde) {
    // Overnight wrap (e.g. 20→06): active when hora >= desde OR hora < hasta.
    return horaLocal < desde && horaLocal >= hasta;
  }
  return horaLocal < desde || horaLocal >= hasta;
}

/**
 * Normalize a company name for the EXACT auto-vinculación match
 * (E2·T9): trim + lowercase + strip diacritics ('Construcción' ≡
 * 'Construccion'). No other folding — 'X S.A.' ≠ 'X'.
 */
function normalizarNombreEmpresa(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Typed error code for logs — never the message (bodies are PII). */
function codigoDeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const codigo = (error as { codigo?: unknown }).codigo;
    if (typeof codigo === 'string') return codigo;
  }
  return error instanceof Error ? error.name : 'ERROR_DESCONOCIDO';
}

/** E3·T4: null/blank ficha field → null (nothing to upsert). */
function textoNoVacio(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

export class GenerarRespuestaAgenteUseCase {
  private readonly config: ConfigAgente;

  constructor(private readonly deps: GeneradorRespuestaAgenteDeps) {
    this.config = deps.config ?? crearConfigAgente();
  }

  async ejecutar(
    conversacionId: number,
    ahora: Date = new Date(),
    opciones: OpcionesEjecutarMotor = {},
  ): Promise<ResultadoAgente> {
    const sinEfectos = (resultado: ResultadoMotorAgente): ResultadoAgente => ({
      conversacionId,
      resultado,
      mensajeId: null,
      score: null,
    });

    // E3·T2: a blank indicación is NO indicación — the plain path runs.
    const indicacion = opciones.indicacionHumana?.trim() ?? '';
    const conIndicacion = indicacion !== '';

    // 1. Only IA-attended conversations belong to the engine: ACTIVA_IA
    //    (linked) or PENDIENTE_VINCULACION (E2·T9 unlinked). With an
    //    indicación, REQUIERE_HUMANO joins too (E3·T2 retake). Every
    //    other estado is a zero-side-effect no-op.
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (
      conversacion === null ||
      !(conIndicacion ? ESTADOS_ATENDIDOS_CON_INDICACION : ESTADOS_ATENDIDOS_IA).has(
        conversacion.estado,
      )
    ) {
      return sinEfectos('CONVERSACION_NO_ACTIVA_IA');
    }

    // 2. Kill switch — global off, zero side effects.
    if (!this.config.habilitado) return sinEfectos('AGENTE_DESHABILITADO');

    // 3. Business hours (local wall clock, overnight wrap honored): the
    //    message waits, the conversation stays ACTIVA_IA untouched.
    if (esFueraDeHorario(ahora, this.config.horarioDesde, this.config.horarioHasta)) {
      return sinEfectos('FUERA_DE_HORARIO');
    }

    // 3b. Destination: sin teléfono no hay envío posible — the same
    //     SIN_TELEFONO guard responderConversacion enforces, checked
    //     BEFORE any recall/LLM call so nothing is spent on a thread
    //     that cannot receive the answer.
    if (conversacion.telefono === null) return sinEfectos('CONVERSACION_NO_ACTIVA_IA');

    // 4. Whole thread (paged newest-first): the exchange limit counts
    //    IA messages across the ENTIRE thread, not just the historial
    //    window — a long thread must still hit the cap.
    const hiloDesc = await this.cargarHilo(conversacionId);
    const limiteAlcanzado =
      hiloDesc.filter((mensaje) => mensaje.emisor === 'IA').length >= this.config.maxIntercambios;

    // 5. The trigger: the last IN/CLIENTE cuerpo (the thread is
    //    newest-first, so the FIRST match scanning down IS the last
    //    client message). Without one there is nothing to answer.
    const disparador = hiloDesc.find(
      (mensaje) => mensaje.direccion === 'IN' && mensaje.emisor === 'CLIENTE',
    );
    if (disparador === undefined) return sinEfectos('CONVERSACION_NO_ACTIVA_IA');
    const consultaOriginal = disparador.cuerpo;

    // 6-8. Recall + masked generation (SKIPPED on the limit escalation:
    // no LLM call is spent on a thread already bound for a human).
    // E3: memoriaActiva=false (undefined ≡ active) opts out of the
    // Engram memory — recall AND distillation — without touching the
    // KB recall (privacy opt-out, not a knowledge opt-out).
    const memoriaActiva = conversacion.memoriaActiva !== false;
    let respuesta: RespuestaGenerada | null = null;
    let titulosConocimiento = new Map<number, string>();
    if (!limiteAlcanzado) {
      const conocimiento = await recuperarConocimiento(
        this.deps.conocimiento,
        consultaOriginal,
        TOP_K_CONOCIMIENTO,
      );
      titulosConocimiento = new Map(
        conocimiento.map((rankeada) => [rankeada.entrada.id, rankeada.entrada.titulo]),
      );

      let memorias: FragmentoMemoria[] = [];
      let memoriasChat: ObservacionMemoria[] = [];
      if (conversacion.empresaId !== null && memoriaActiva) {
        const contexto = await this.deps.memoria.contexto(conversacion.empresaId);
        const hallazgos = await this.deps.memoria.buscar(
          consultaOriginal,
          conversacion.empresaId,
          conversacion.id,
          TOP_K_MEMORIA,
        );
        // E4·T3: hybrid recall — the pinned + search candidates are
        // SCORED (lexical ×2 + freshness + chat proximity + pin
        // boost), deduplicated and budgeted per block BEFORE the
        // prompt. Ranking replaces the naive [...contexto,
        // ...hallazgos] merge; pineados always survive their block.
        const rankeadas = rankearMemorias({
          consulta: consultaOriginal,
          pineados: contexto,
          hallazgos,
          ahora,
          presupuestos: {
            pineados: MAX_MEMORIAS_PINEADOS,
            empresa: MAX_MEMORIAS_EMPRESA,
            chat: MAX_MEMORIAS_CHAT,
          },
        });
        memorias = rankeadas.map((observacion) => ({
          tipo: observacion.tipo,
          titulo: observacion.titulo,
          contenido: observacion.contenido,
        }));
        memoriasChat = rankeadas.filter((observacion) => observacion.nivel === 'chat');
      }

      const historial: MensajeHistorialGeneracion[] = hiloDesc
        .slice(0, MAX_HISTORIAL)
        .reverse()
        .map((mensaje) => ({ emisor: mensaje.emisor, texto: enmascararTelefonos(mensaje.cuerpo) }));

      // E4·T3: compact thread synthesis from the SAME masked
      // historial the prompt receives — with the memory opt-out (or
      // no empresa) it carries counts + last client ask only (no
      // "Temas tratados" line).
      const sintesisHilo = sintetizarHilo({ historial, memoriasChat });

      respuesta = await this.deps.generador.generarRespuesta({
        consulta: enmascararTelefonos(consultaOriginal),
        // E2·T9: unlinked conversations ask for nombre/empresa in the
        // answer itself (progressive identification).
        contactoNuevo: conversacion.empresaId === null,
        historial,
        conocimiento: conocimiento.map((rankeada) => ({
          id: rankeada.entrada.id,
          titulo: rankeada.entrada.titulo,
          contenido: rankeada.entrada.contenido,
        })),
        memorias,
        // E4·T3: the synthesis rides between CONSULTA and HISTORIAL
        // in the rendered prompt (see mensajeUsuarioGenerar).
        sintesisHilo,
        // E3·T2: the operator instruction rides the LLM input masked
        // like every other body (PII policy — consulta precedent).
        indicacionHumana: conIndicacion ? enmascararTelefonos(indicacion) : undefined,
      });
    }

    // 9. Decision: answer only when in scope, no human-help flag and
    //    confidence at or above the threshold (>= inclusive). E3·T2:
    //    with an indicación the CONTENT is already authorized by a
    //    human — the scope/umbral gate is skipped (a null respuesta
    //    stays non-answering: the limit escalation never had one).
    const responder =
      respuesta !== null &&
      (conIndicacion ||
        (respuesta.enScope &&
          !respuesta.requiereAyudaHumana &&
          respuesta.scoreConfianza >= this.config.umbralConfianza));
    if (conIndicacion && respuesta !== null && respuesta.requiereAyudaHumana) {
      // The human already intervened (the indicación) — answering is
      // right, but the model asking for help anyway deserves a warn.
      console.warn('[generarRespuestaAgente] generador pidió ayuda humana pese a la indicación', {
        conversacionId,
      });
    }
    const textoFinal =
      respuesta !== null && responder ? respuesta.texto : this.config.textoEscalado;
    // Audit: null score/modelo ONLY on the limit escalation (no
    // generation happened); a confidence-based escalation still audits
    // the score the model reported. E4·T1: promptVersion follows the
    // SAME presence/absence pattern — 'v2' whenever a generation ran,
    // null when no LLM call happened. E4·T5: fidelidad too — the
    // model's self-assessed source fidelity (null when the model
    // didn't report one, null when no generation ran).
    const score = respuesta !== null ? respuesta.scoreConfianza : null;
    const fidelidad = respuesta !== null ? (respuesta.fidelidad ?? null) : null;
    const modelo = respuesta !== null ? respuesta.modelo : null;
    const promptVersion = respuesta !== null ? PROMPT_VERSION : null;
    // E3·T2 widens the audit union: KB citations plus the human
    // indicación marker ({id} present only on KB rows).
    const fuentesAuditoria: Array<{
      id?: number;
      tipo: 'KB' | 'indicacion_humana';
      titulo: string;
    }> = (respuesta?.idsConocimiento ?? []).flatMap((id) => {
      const titulo = titulosConocimiento.get(id);
      return titulo === undefined ? [] : [{ id, tipo: 'KB' as const, titulo }];
    });
    // E3·T2: an indicación-driven answer must visibly record WHERE its
    // authority came from — extend (never replace) the KB list with
    // the marker; with no KB ids the fuentes is the marker alone.
    if (conIndicacion) {
      fuentesAuditoria.push({ tipo: 'indicacion_humana', titulo: 'Indicación humana' });
    }
    const fuentesJson = JSON.stringify(fuentesAuditoria);

    // 10. Outbox-lite (responderConversacion mirror): persist the OUT
    //     intent PENDIENTE with the RAG audit columns BEFORE sending —
    //     an intent-persist failure propagates (nothing went out).
    const mensaje = await this.deps.mensajes.crear({
      conversacionId: conversacion.id,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: textoFinal,
      tipo: 'TEXTO',
      canal: 'WHATSAPP',
      wamid: null,
      idempotenciaKey: null,
      estadoEnvio: 'PENDIENTE',
      fuentes: fuentesJson,
      score,
      fidelidad,
      modelo,
      promptVersion,
    });

    const envio = await this.deps.whatsapp.enviar({
      telefonoE164: conversacion.telefono,
      cuerpo: textoFinal,
    });
    if (!envio.ok) {
      // Best-effort FALLIDO (retry is safe — nothing went out) and the
      // conversation KEEPS ACTIVA_IA: T5 retries this row.
      try {
        await this.deps.mensajes.actualizarEnvio(mensaje.id, { estadoEnvio: 'FALLIDO' });
      } catch (errorMarcado) {
        console.error('[generarRespuestaAgente] marcado FALLIDO falló', {
          mensajeId: mensaje.id,
          error: codigoDeError(errorMarcado),
        });
      }
      return { conversacionId, resultado: 'FALLIDO_ENVIO', mensajeId: mensaje.id, score };
    }

    // Confirmation: a failure here means the send HAPPENED — log, keep
    // the PENDIENTE row as the truth and continue (never re-send).
    let confirmado: MensajeCrm | null = mensaje;
    try {
      confirmado = await this.deps.mensajes.actualizarEnvio(mensaje.id, {
        estadoEnvio: 'ENVIADO',
        wamid: envio.wamid,
      });
    } catch (errorConfirmacion) {
      console.error('[generarRespuestaAgente] confirmación post-envío falló', {
        mensajeId: mensaje.id,
        wamid: envio.wamid,
        error: codigoDeError(errorConfirmacion),
      });
    }
    const mensajeFinal = confirmado ?? mensaje;

    // 11. Bandeja tick OUT: best-effort, outside the confirmation try —
    //     a lost tick never lies about the send.
    try {
      await this.deps.conversaciones.registrarActividad(conversacion.id, 'OUT');
    } catch (errorActividad) {
      console.error('[generarRespuestaAgente] registrar actividad OUT falló', {
        conversacionId: conversacion.id,
        mensajeId: mensajeFinal.id,
        error: codigoDeError(errorActividad),
      });
    }

    // 12. Escalation state flip — ONLY after a successful send (a
    //     FALLIDO_ENVIO above never reaches here). Best-effort: the
    //     durable side effect is the sent message; a failed flip is
    //     logged for an operator, never retried by re-sending.
    //     E3·T2: the escalation ALSO persists the help request the
    //     operator will answer (best-effort, never stacked).
    if (!responder) {
      try {
        await this.deps.conversaciones.actualizarEstado(conversacion.id, 'REQUIERE_HUMANO');
      } catch (errorEstado) {
        console.error('[generarRespuestaAgente] pasar a REQUIERE_HUMANO falló', {
          conversacionId: conversacion.id,
          error: codigoDeError(errorEstado),
        });
      }
      await this.registrarSolicitudAyuda({
        conversacionId: conversacion.id,
        disparadorId: disparador.id,
        consultaOriginal,
        score,
      });
    }

    // 12b. E3·T2 retake: an indicación-driven answer on a thread that
    //      came in as REQUIERE_HUMANO hands the conversation BACK to
    //      la Guía — estado ACTIVA_IA + modo IA (vincularConversacion
    //      mirror: actualizarEstado never touches modo). Best-effort,
    //      same as the escalation flip. Other estados need no flip.
    if (responder && conIndicacion && conversacion.estado === 'REQUIERE_HUMANO') {
      try {
        await this.deps.conversaciones.actualizarEstado(conversacion.id, 'ACTIVA_IA');
        await this.deps.conversaciones.actualizarModo?.(conversacion.id, 'IA');
      } catch (errorRetomar) {
        console.error('[generarRespuestaAgente] retomar ACTIVA_IA tras indicación falló', {
          conversacionId: conversacion.id,
          error: codigoDeError(errorRetomar),
        });
      }
    }

    // 13. Distillation — ONLY on RESPONDIDO, ONLY while memoriaActiva
    //     (E3 privacy opt-out; the ficha piggybacks the same call, so
    //     the opt-out covers it too), best-effort and never throws.
    //     The MEMORY side still requires an empresa; E3·T4 widens the
    //     gate to "someone to distill FOR": a contacto-only row (no
    //     empresa) skips the memory saves but still feeds la ficha
    //     (cargo keys on the contacto). Nothing to distill for (no
    //     empresa AND no contacto — the unlinked case) skips entirely.
    if (
      responder &&
      memoriaActiva &&
      (conversacion.empresaId !== null || conversacion.contactoId !== null)
    ) {
      await this.destilarYGuardar({
        consultaOriginal,
        textoFinal,
        empresaId: conversacion.empresaId,
        contactoId: conversacion.contactoId,
        conversacionId: conversacion.id,
        mensajeId: mensajeFinal.id,
      });
    }

    // 14. Progressive identification (E2·T9) — ONLY on RESPONDIDO and
    //     ONLY while the conversation has no contacto: best-effort
    //     extraction of the stated nombre/empresa and, on ONE exact
    //     normalized match, the auto-vinculación. Never throws — the
    //     sent answer is the durable truth.
    if (responder && conversacion.contactoId === null) {
      await this.identificarYVincular({
        consultaOriginal,
        textoFinal,
        conversacionId: conversacion.id,
      });
    }

    return {
      conversacionId,
      resultado: responder ? 'RESPONDIDO' : 'ESCALADO',
      mensajeId: mensajeFinal.id,
      score,
    };
  }

  /** Load the WHOLE thread newest-first, following the antesDeId cursor. */
  private async cargarHilo(conversacionId: number): Promise<MensajeCrm[]> {
    const hilo: MensajeCrm[] = [];
    let antesDeId: number | undefined;
    for (;;) {
      const opciones: ListarMensajesOpciones =
        antesDeId === undefined ? { limite: LIMITE_PAGINA_HILO } : { limite: LIMITE_PAGINA_HILO, antesDeId };
      const pagina = await this.deps.mensajes.listarPorConversacion(conversacionId, opciones);
      hilo.push(...pagina);
      if (pagina.length < LIMITE_PAGINA_HILO) break;
      const ultima = pagina.at(-1);
      if (ultima === undefined) break;
      antesDeId = ultima.id;
    }
    return hilo;
  }

  /**
   * E3·T2 escalation side effect: persist the help request the
   * operator will answer — the consulta that defeated the RAG, the
   * prefilter terms (extraerTerminosRecall) and the audited score
   * (null on the limit escalation, where no generation happened).
   * NEVER stacks: skipped when a PENDIENTE request already exists for
   * the conversation. Repos without the optional E3 capability skip
   * entirely (pre-E3 fakes/adapters stay valid). Best-effort: every
   * failure only logs (codigo + conversation id — bodies are PII) and
   * the already-sent escalation stays the durable truth.
   */
  private async registrarSolicitudAyuda(params: {
    conversacionId: number;
    disparadorId: number;
    consultaOriginal: string;
    score: number | null;
  }): Promise<void> {
    const repo = this.deps.conversaciones;
    if (repo.crearSolicitudAyuda === undefined || repo.obtenerSolicitudAyudaPendiente === undefined) {
      return;
    }
    try {
      const pendiente = await repo.obtenerSolicitudAyudaPendiente(params.conversacionId);
      if (pendiente !== null) return;
      await repo.crearSolicitudAyuda({
        conversacionId: params.conversacionId,
        mensajeId: params.disparadorId,
        consulta: params.consultaOriginal,
        terminosBuscados: extraerTerminosRecall(params.consultaOriginal),
        score: params.score,
      });
    } catch (errorSolicitud) {
      console.error('[generarRespuestaAgente] registrar solicitud de ayuda falló', {
        conversacionId: params.conversacionId,
        error: codigoDeError(errorSolicitud),
      });
    }
  }

  /**
   * Post-send distillation: distilar the ORIGINAL (unmasked) exchange,
   * guardar each observation (agreements/commitments at 'empresa'
   * level, everything else 'chat') with a deterministic operationId,
   * and pin when asked. E3·T4: the SAME destilar call may carry a
   * `ficha` block — written FIRST (right after destilar returns) into
   * CRM_ExtraccionesFicha with the motor keying (cargo → the contacto;
   * trabajadores/sedes → the empresa). Memory saves still require an
   * empresa. Every failure warns with codigo + conversation id ONLY
   * (bodies are PII) and continues — distillation must never change
   * the already-sent outcome.
   */
  private async destilarYGuardar(params: {
    consultaOriginal: string;
    textoFinal: string;
    empresaId: number | null;
    contactoId: number | null;
    conversacionId: number;
    mensajeId: number;
  }): Promise<void> {
    let distilacion: ResultadoDestilacion;
    try {
      distilacion = await this.deps.generador.destilar({
        consulta: params.consultaOriginal,
        respuesta: params.textoFinal,
      });
    } catch (errorDestilar) {
      console.warn('[generarRespuestaAgente] destilación falló', {
        conversacionId: params.conversacionId,
        codigo: codigoDeError(errorDestilar),
      });
      return;
    }
    // E3·T4 ficha first: extraction landing, IA-origin, unconfirmed —
    // the operator confirms (and promotes) through confirmarDatoFicha.
    await this.guardarFichaDestilada(distilacion.ficha, params);
    if (params.empresaId === null) return;
    const observaciones: ObservacionDestilada[] = [...distilacion];
    for (let indice = 0; indice < observaciones.length; indice += 1) {
      const observacion = observaciones[indice];
      if (observacion === undefined) continue;
      try {
        const resultado = await this.deps.memoria.guardar({
          empresaId: params.empresaId,
          conversacionId: params.conversacionId,
          nivel: observacion.tipo === 'acuerdo' || observacion.tipo === 'compromiso' ? 'empresa' : 'chat',
          tipo: observacion.tipo,
          titulo: observacion.titulo,
          contenido: observacion.contenido,
          operationId: `dest-${params.conversacionId}-${params.mensajeId}-${indice}`,
        });
        if (observacion.pinear && resultado.id > 0) {
          await this.deps.memoria.pinear(resultado.id);
        }
      } catch (errorGuardar) {
        console.warn('[generarRespuestaAgente] guardar observación destilada falló', {
          conversacionId: params.conversacionId,
          codigo: codigoDeError(errorGuardar),
        });
      }
    }
  }

  /**
   * E3·T4: land the destilar ficha block as IA extractions. Keying —
   * cargo → contactoId (empresaId null; empresa-keyed only when the
   * conversation carries NO contacto), trabajadores/sedes → empresaId
   * (contactoId null, skipped without an empresa). Per-field
   * try/catch: one failed upsert never sinks the others nor the run.
   * upsertExtraccionFicha is optional — repos without the E3·T1
   * capability skip silently (actualizarModo precedent). Logs carry
   * codigo + conversation id only — ficha values are client data.
   */
  private async guardarFichaDestilada(
    ficha: FichaDestilada | undefined,
    params: { contactoId: number | null; empresaId: number | null; conversacionId: number },
  ): Promise<void> {
    if (ficha === undefined) return;
    const upsert = this.deps.conversaciones.upsertExtraccionFicha;
    if (upsert === undefined) return;

    const escrituras: Array<{
      contactoId: number | null;
      empresaId: number | null;
      campo: CampoFicha;
      valor: string;
    }> = [];
    const cargo = textoNoVacio(ficha.cargo);
    if (cargo !== null) {
      escrituras.push({
        contactoId: params.contactoId,
        empresaId: params.contactoId !== null ? null : params.empresaId,
        campo: 'cargo',
        valor: cargo,
      });
    }
    if (params.empresaId !== null) {
      const trabajadores = textoNoVacio(ficha.trabajadores);
      if (trabajadores !== null) {
        escrituras.push({
          contactoId: null,
          empresaId: params.empresaId,
          campo: 'trabajadores',
          valor: trabajadores,
        });
      }
      const sedes = textoNoVacio(ficha.sedes);
      if (sedes !== null) {
        escrituras.push({ contactoId: null, empresaId: params.empresaId, campo: 'sedes', valor: sedes });
      }
    }

    for (const escritura of escrituras) {
      try {
        await upsert.call(this.deps.conversaciones, {
          contactoId: escritura.contactoId,
          empresaId: escritura.empresaId,
          campo: escritura.campo,
          valor: escritura.valor,
          origen: 'IA',
          confirmado: false,
        });
      } catch (errorFicha) {
        console.warn('[generarRespuestaAgente] guardar extracción de ficha falló', {
          conversacionId: params.conversacionId,
          campo: escritura.campo,
          codigo: codigoDeError(errorFicha),
        });
      }
    }
  }

  /**
   * Post-send progressive identification (E2·T9): extract the
   * nombre/empresa the client STATED in the just-sent exchange and,
   * when the empresa EXACTLY matches ONE CRM_Empresas row (normalized
   * on both sides), create the contacto + vincular (ACTIVA_IA) + pin
   * modo IA — the vincularConversacion mirror (repo vincular never
   * touches modo). Every failure — extraction throw, listing error,
   * 0 or >1 exact matches, empresas dep absent, write error — only
   * warns with codigo + conversation id (bodies and company names are
   * never logged) and leaves the already-sent outcome untouched: the
   * chat keeps collecting and the operator can link manually anytime.
   */
  private async identificarYVincular(params: {
    consultaOriginal: string;
    textoFinal: string;
    conversacionId: number;
  }): Promise<void> {
    let identificacion: IdentificacionExtraida | null;
    try {
      identificacion = await this.deps.generador.extraerIdentificacion({
        consulta: params.consultaOriginal,
        respuesta: params.textoFinal,
      });
    } catch (errorIdentificar) {
      console.warn('[generarRespuestaAgente] extracción de identificación falló', {
        conversacionId: params.conversacionId,
        codigo: codigoDeError(errorIdentificar),
      });
      return;
    }
    if (identificacion === null) return;

    const empresaBuscada = identificacion.empresa;
    if (empresaBuscada === null || empresaBuscada.trim() === '') return;
    const normalizada = normalizarNombreEmpresa(empresaBuscada);
    if (normalizada === '') return;

    // Optional capability (E2·T9): without the registry dep there is
    // nothing to match against — keep attending, keep collecting.
    if (this.deps.empresas === undefined) return;

    let candidatas: Empresa[];
    try {
      candidatas = await this.deps.empresas.listar({ q: normalizada });
    } catch (errorListar) {
      console.warn('[generarRespuestaAgente] búsqueda de empresas para vinculación falló', {
        conversacionId: params.conversacionId,
        codigo: codigoDeError(errorListar),
      });
      return;
    }
    // EXACT normalized match only — fuzzy listing rows never vinculate.
    const exactas = candidatas.filter(
      (candidata) => normalizarNombreEmpresa(candidata.razonSocial) === normalizada,
    );
    if (exactas.length !== 1) {
      // id-level log only (no company names — client-named PII).
      console.log('[generarRespuestaAgente] identificación sin vínculo único', {
        conversacionId: params.conversacionId,
        coincidenciasExactas: exactas.length,
      });
      return;
    }

    const empresa = exactas[0];
    if (empresa === undefined) return;
    const nombre =
      identificacion.nombre !== null && identificacion.nombre.trim() !== ''
        ? identificacion.nombre.trim()
        : 'Contacto WhatsApp';
    try {
      const { contactoId } = await this.deps.conversaciones.crearContacto(empresa.id, { nombre });
      await this.deps.conversaciones.vincular(params.conversacionId, {
        empresaId: empresa.id,
        contactoId,
        estado: 'ACTIVA_IA',
      });
      // Mirror of vincularConversacion: repo vincular never touches
      // modo — the flip rides its own call (absent capability: skip).
      await this.deps.conversaciones.actualizarModo?.(params.conversacionId, 'IA');
      console.log('[generarRespuestaAgente] conversación auto-vinculada', {
        conversacionId: params.conversacionId,
        empresaId: empresa.id,
        contactoId,
      });
    } catch (errorVincular) {
      console.warn('[generarRespuestaAgente] auto-vinculación falló', {
        conversacionId: params.conversacionId,
        codigo: codigoDeError(errorVincular),
      });
    }
  }
}
