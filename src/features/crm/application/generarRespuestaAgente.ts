import type {
  Empresa,
  EstadoConversacion,
  FragmentoMemoria,
  IdentificacionExtraida,
  MensajeCrm,
  MensajeHistorialGeneracion,
  ObservacionDestilada,
  RespuestaGenerada,
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
  TOP_K_CONOCIMIENTO,
  TOP_K_MEMORIA,
  type ConfigAgente,
} from './configAgente';
import { recuperarConocimiento } from './recuperarConocimiento';

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
 * LLM input (consulta + historial); every persisted, sent and
 * distilled body stays verbatim. Logs never carry bodies — only ids
 * and typed error codes.
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

export class GenerarRespuestaAgenteUseCase {
  private readonly config: ConfigAgente;

  constructor(private readonly deps: GeneradorRespuestaAgenteDeps) {
    this.config = deps.config ?? crearConfigAgente();
  }

  async ejecutar(conversacionId: number, ahora: Date = new Date()): Promise<ResultadoAgente> {
    const sinEfectos = (resultado: ResultadoMotorAgente): ResultadoAgente => ({
      conversacionId,
      resultado,
      mensajeId: null,
      score: null,
    });

    // 1. Only IA-attended conversations belong to the engine: ACTIVA_IA
    //    (linked) or PENDIENTE_VINCULACION (E2·T9 unlinked). Every
    //    other estado is a zero-side-effect no-op.
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (conversacion === null || !ESTADOS_ATENDIDOS_IA.has(conversacion.estado)) {
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
      if (conversacion.empresaId !== null) {
        const contexto = await this.deps.memoria.contexto(conversacion.empresaId);
        const hallazgos = await this.deps.memoria.buscar(
          consultaOriginal,
          conversacion.empresaId,
          conversacion.id,
          TOP_K_MEMORIA,
        );
        memorias = [...contexto, ...hallazgos].map((observacion) => ({
          tipo: observacion.tipo,
          titulo: observacion.titulo,
          contenido: observacion.contenido,
        }));
      }

      const historial: MensajeHistorialGeneracion[] = hiloDesc
        .slice(0, MAX_HISTORIAL)
        .reverse()
        .map((mensaje) => ({ emisor: mensaje.emisor, texto: enmascararTelefonos(mensaje.cuerpo) }));

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
      });
    }

    // 9. Decision: answer only when in scope, no human-help flag and
    //    confidence at or above the threshold (>= inclusive).
    const responder =
      respuesta !== null &&
      respuesta.enScope &&
      !respuesta.requiereAyudaHumana &&
      respuesta.scoreConfianza >= this.config.umbralConfianza;
    const textoFinal =
      respuesta !== null && responder ? respuesta.texto : this.config.textoEscalado;
    // Audit: null score/modelo ONLY on the limit escalation (no
    // generation happened); a confidence-based escalation still audits
    // the score the model reported.
    const score = respuesta !== null ? respuesta.scoreConfianza : null;
    const modelo = respuesta !== null ? respuesta.modelo : null;
    const fuentesJson = JSON.stringify(
      (respuesta?.idsConocimiento ?? []).flatMap((id) => {
        const titulo = titulosConocimiento.get(id);
        return titulo === undefined ? [] : [{ id, tipo: 'KB' as const, titulo }];
      }),
    );

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
      modelo,
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
    if (!responder) {
      try {
        await this.deps.conversaciones.actualizarEstado(conversacion.id, 'REQUIERE_HUMANO');
      } catch (errorEstado) {
        console.error('[generarRespuestaAgente] pasar a REQUIERE_HUMANO falló', {
          conversacionId: conversacion.id,
          error: codigoDeError(errorEstado),
        });
      }
    }

    // 13. Distillation — ONLY on RESPONDIDO, ONLY with an empresa (the
    //     memory port requires empresaId), best-effort and never throws.
    if (responder && conversacion.empresaId !== null) {
      await this.destilarYGuardar({
        consultaOriginal,
        textoFinal,
        empresaId: conversacion.empresaId,
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
   * Post-send distillation: distilar the ORIGINAL (unmasked) exchange,
   * guardar each observation (agreements/commitments at 'empresa'
   * level, everything else 'chat') with a deterministic operationId,
   * and pin when asked. Every failure warns with codigo + conversation
   * id ONLY (bodies are PII) and continues — distillation must never
   * change the already-sent outcome.
   */
  private async destilarYGuardar(params: {
    consultaOriginal: string;
    textoFinal: string;
    empresaId: number;
    conversacionId: number;
    mensajeId: number;
  }): Promise<void> {
    let observaciones: ObservacionDestilada[];
    try {
      observaciones = await this.deps.generador.destilar({
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
