/**
 * CRM domain entities — registro de empresas (spec G1).
 *
 * Multi-contact model: Empresa (1) → Contactos (N), Contacto (1) →
 * Correos (N). Teléfono lives at Contacto level. Pure types — no
 * framework, DB or transport imports (hexagonal domain layer).
 */

/** Exactly one per empresa (spec G1; CHECK-backed in CRM_Empresas). */
export type TipoEmpresa = 'Cliente' | 'Prospecto';

/**
 * The six-value sector domain (rediseno-crm-panel, design D6; spec
 * crm-data-normalization). CANONICAL STORAGE FORM = the labels
 * themselves ("Minería y Energía" is stored, spec OQ3 resolved); the
 * alta rubro select preselects the first. Single source — the Excel
 * vocabulary, the modal options and the SQL NVARCHAR(60) column all
 * derive from this list.
 */
export const SECTORES_CRM = [
  'Construcción',
  'Minería y Energía',
  'Fábrica y Producción',
  'Transporte y Almacén',
  'Comercio y Tiendas',
  'Oficinas y Servicios',
] as const;

export type SectorCrm = (typeof SECTORES_CRM)[number];

/** Registration door (design D3); NULL = not yet classified. */
export type Origen = 'Inbound' | 'Outbound';

/**
 * Pipeline flows — two doors, one cadence engine (design D3). The
 * INBOUND door opens on an inbound contact, the OUTBOUND door on
 * prospecting; T12/T13/T15 move empresas across flows.
 */
export type Flujo = 'INBOUND' | 'OUTBOUND';

export type EtapaInbound =
  | 'REGISTRADO'
  | 'SEGUIMIENTO'
  | 'PRESENTACION'
  | 'CONFIRMADA'
  | 'ENTREGADA';

export type EtapaOutbound =
  | 'NUEVO'
  | 'CADENCIA'
  | 'ACEPTADO'
  | 'DATOS'
  | 'DESCANSO';

/**
 * RECHAZADO (design D3's 11th state) is cross-flow: the T14 rejection
 * KEEPS the current flujo and stores `rechazadoHasta` on the pipeline
 * row (3-month cooldown, T15 reactivation).
 */
export type Etapa = EtapaInbound | EtapaOutbound | 'RECHAZADO';

export interface Correo {
  id: number;
  contactoId: number;
  /** Normalized (lowercase, trimmed) address. */
  correo: string;
}

/**
 * The empresa's pipeline row (design D3 1:1, `CRM_Pipeline`) — the
 * machine state (`flujo`/`etapa`) plus the denormalized cadence
 * counters the daily queue scans (design §3). DATE markers cross the
 * boundary as `YYYY-MM-DD` strings; the SQL adapter owns the mapping.
 * `motivoRechazo` is the latest rejection's motivo — a mirror of the
 * CRM_Transiciones audit, not a second source of history.
 */
export interface PipelineEmpresa {
  empresaId: number;
  flujo: Flujo;
  etapa: Etapa;
  /** Rest-cycle round (T9 increments; arms start at 1). */
  ciclo: number;
  /** Sends logged in the current cycle (1–4; 0 = unarmed stage). */
  enviosCiclo: number;
  /** Cycle start (T2/T7/T9/T12 arm = hoy). */
  fechaCicloInicio: string | null;
  /** Last send of the cycle (T8 derives descansoHasta from it). */
  fechaUltimoEnvio: string | null;
  /** T8's 3-month rest boundary (T9 clears). */
  descansoHasta: string | null;
  /** T14's 3-month rejection cooldown (T15 clears). */
  rechazadoHasta: string | null;
  motivoRechazo: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Contacto {
  id: number;
  empresaId: number;
  nombre: string;
  telefono: string | null;
  /** Exactly one principal per empresa (default cadence addressee). */
  esPrincipal: boolean;
  /**
   * Operational role (crm-ux redesign): Facturación / Médico
   * ocupacional / Administrador — null for regular contactos.
   * Optional so non-SQL fakes stay valid; the SQL adapter always
   * sets it.
   */
  cargo?: string | null;
  correos: Correo[];
}

export interface Empresa {
  id: number;
  ruc: string;
  /** Normalized RUC (trim, strip non-alphanumerics) — unique key (spec G1). */
  rucNormalizado: string;
  razonSocial: string;
  tipo: TipoEmpresa;
  origen: Origen | null;
  proyectoObra: string | null;
  destinoComun: string | null;
  notas: string | null;
  /** Nullable username; NULL = unassigned/pool (spec G5). */
  responsable: string | null;
  /**
   * Operational rubro (rediseno-crm-panel D6); NULL = pre-change rows.
   * Optional so non-SQL fakes stay valid; the SQL adapter always sets it
   * (Contacto.cargo precedent).
   */
  sector?: SectorCrm | null;
  /** Head-count for the OcupaCare offering; NULL = unknown. */
  cantidadTrabajadores?: number | null;
  contactos: Contacto[];
  createdAt: string;
  updatedAt: string;
}

// ---- Input DTOs (application boundary; pr3 use cases consume these) ----

export interface CrearContactoInput {
  nombre: string;
  telefono?: string | null;
  /** Operational role label shown on the panel (alta default "Recursos Humanos / Seguridad"). */
  cargo?: string | null;
  /**
   * Undefined principal → the FIRST listed contacto becomes principal
   * (spec G1 default-principal scenario). Swap demotes the other.
   */
  esPrincipal?: boolean;
  /** At least one correo per contacto (spec G1 rejection scenario). */
  correos: string[];
}

export interface CrearEmpresaInput {
  ruc: string;
  razonSocial: string;
  tipo: TipoEmpresa;
  origen?: Origen | null;
  proyectoObra?: string | null;
  destinoComun?: string | null;
  notas?: string | null;
  responsable?: string | null;
  /** Rubro label from SECTORES_CRM; omitted → NULL (alta can defer it). */
  sector?: SectorCrm | null;
  cantidadTrabajadores?: number | null;
  contactos: CrearContactoInput[];
}

export interface ActualizarEmpresaInput {
  razonSocial?: string;
  tipo?: TipoEmpresa;
  origen?: Origen | null;
  proyectoObra?: string | null;
  destinoComun?: string | null;
  notas?: string | null;
  responsable?: string | null;
}

// ---- Assignment (spec G5 — cartera; pr14) ----

/**
 * Assignment event catalog (CHECK-backed in CRM_Asignaciones).
 * ASIGNADO = pool → user; REASIGNADO = user → user (reassign replaces
 * the owner); DEVUELTO = user → pool.
 */
export type AccionAsignacion = 'ASIGNADO' | 'REASIGNADO' | 'DEVUELTO';

/**
 * One assignment audit row (spec G5 traceability: every assign,
 * reassign and return event records actor, target user and timestamp).
 * The empresa's `responsable` column is the CURRENT owner (single-owner
 * invariant, NULL = pool); this table is the HISTORY.
 */
export interface Asignacion {
  id: number;
  empresaId: number;
  accion: AccionAsignacion;
  /** Owner before the event; NULL when the empresa came from the pool. */
  responsablePrevio: string | null;
  /** Owner after the event; NULL = back to the pool. */
  responsableNuevo: string | null;
  /** Acting session user. */
  actorUsuario: string;
  createdAt: string;
}

// ---- Conversaciones del agente IA (agente-ia-crm, E1) ----

/** Canal de entrada (E1 WhatsApp vía Kapso; EMAIL llega en E5). */
export type CanalConversacion = 'WHATSAPP' | 'EMAIL';

/**
 * The conversation lifecycle (agente-ia-crm decision 6; CHECK-backed
 * in CRM_Conversaciones): PENDIENTE_VINCULACION at birth (sin match
 * de contacto), ACTIVA_IA while la Guía answers alone,
 * REQUIERE_HUMANO when she escalates, TOMADA_HUMANO once an operator
 * takes over, PAUSADA (retención/kill switch) and CERRADA.
 */
export type EstadoConversacion =
  | 'ACTIVA_IA'
  | 'REQUIERE_HUMANO'
  | 'TOMADA_HUMANO'
  | 'PAUSADA'
  | 'PENDIENTE_VINCULACION'
  | 'CERRADA';

/** Who authored one message: the client, la Guía (IA) or an operator. */
export type EmisorMensaje = 'CLIENTE' | 'IA' | 'HUMANO';

/** Quién gestiona la conversación: la Guía sola o un humano. */
export type ModoConversacion = 'IA' | 'HUMANO';

/** Direccion del mensaje respecto al CRM (inbound / outbound). */
export type DireccionMensaje = 'IN' | 'OUT';

/** Tipo de payload (WhatsApp text/media/template). */
export type TipoMensajeCrm = 'TEXTO' | 'MEDIA' | 'PLANTILLA';

/** Send outcome (mensajes OUT, outbox-lite R4): PENDIENTE = intent persistido sin confirmar; null = IN. */
export type EstadoEnvioMensaje = 'PENDIENTE' | 'ENVIADO' | 'FALLIDO';

/**
 * One CRM_Conversaciones row — the E1 foundation table: the channel
 * thread identified per canal by its remote id (`identificadorCanal`)
 * or the normalized E.164 `telefono`, optionally vinculado to the
 * registry (`empresaId`/`contactoId`, NULL until vinculacion). All
 * timestamps cross as ISO strings (DATETIME2(0), adapter-mapped).
 */
export interface ConversacionCrm {
  id: number;
  empresaId: number | null;
  contactoId: number | null;
  canal: CanalConversacion;
  /** Normalized E.164 of the remote (domain normalizarTelefonoE164). */
  telefono: string | null;
  /** Canal-scoped remote id (e.g. Kapso from_user_id). */
  identificadorCanal: string | null;
  estado: EstadoConversacion;
  asignadaA: string | null;
  modo: ModoConversacion;
  /**
   * E3: per-conversation memory toggle — true (DB DEFAULT 1) = la
   * Guía reads/writes the Engram memory for this thread; false =
   * privacy opt-out (no observations saved, no context loaded).
   * OPTIONAL (ultimoMensajeCuerpo E2·T6 precedent): the SQL adapter
   * ALWAYS maps it; pre-E3 fakes/payloads stay valid without it and
   * consumers treat `undefined` as ON (mirrors the DB DEFAULT 1).
   */
  memoriaActiva?: boolean;
  ultimoMensajeEn: string | null;
  noLeidos: number;
  creadoEn: string;
  actualizadoEn: string;
}

/**
 * One CRM_Conversaciones row WIDENED with the display fields the
 * bandeja renders (agente-ia-crm E1): the joined empresa razonSocial
 * and contacto nombre. Both null while PENDIENTE_VINCULACION — the
 * adapter's `listar` derives them from the LEFT JOINs.
 *
 * E2·T6 preview: the LAST message body (adapter caps it at 120 chars)
 * and its emisor — both null when the conversation has no messages
 * yet (OUTER APPLY). Optional so pre-E2 payloads and non-SQL fakes
 * stay valid without them.
 */
export interface ConversacionListada extends ConversacionCrm {
  razonSocial: string | null;
  nombreContacto: string | null;
  ultimoMensajeCuerpo?: string | null;
  ultimoMensajeEmisor?: EmisorMensaje | null;
}

/**
 * One CRM_Mensajes row — the auditable thread item (E1).
 * `fuentes`/`score`/`modelo` are the E2 RAG audit columns, nullable
 * from day one so E2 adds no DDL.
 */
export interface MensajeCrm {
  id: number;
  conversacionId: number;
  direccion: DireccionMensaje;
  emisor: EmisorMensaje;
  cuerpo: string;
  tipo: TipoMensajeCrm;
  canal: CanalConversacion;
  /** WhatsApp message id (dedup/rastreabilidad del canal). */
  wamid: string | null;
  /** Webhook X-Idempotency-Key — unique filtered index backs dedup. */
  idempotenciaKey: string | null;
  estadoEnvio: EstadoEnvioMensaje | null;
  fuentes: string | null;
  score: number | null;
  modelo: string | null;
  /**
   * E4·T1: which prompt version produced this IA message ('v2' today;
   * application/prompt/promptGeneracion). OPTIONAL like
   * ultimoMensajeCuerpo — pre-E4 fakes/payloads stay valid without
   * it; NULL follows the score/modelo pattern (only a generation
   * stamps it, the limit escalation without LLM does not).
   */
  promptVersion?: string | null;
  creadoEn: string;
}

// ---- Input DTOs (conversaciones, agente-ia-crm E1) ----

export interface CrearConversacionInput {
  canal: CanalConversacion;
  /** Normalized E.164 (the webhook flow derives it before persisting). */
  telefono?: string | null;
  identificadorCanal?: string | null;
  empresaId?: number | null;
  contactoId?: number | null;
  /** Defaults to PENDIENTE_VINCULACION (sin match de contacto). */
  estado?: EstadoConversacion;
  modo?: ModoConversacion;
  asignadaA?: string | null;
}

export interface CrearMensajeInput {
  conversacionId: number;
  direccion: DireccionMensaje;
  emisor: EmisorMensaje;
  cuerpo: string;
  tipo?: TipoMensajeCrm;
  canal?: CanalConversacion;
  wamid?: string | null;
  idempotenciaKey?: string | null;
  estadoEnvio?: EstadoEnvioMensaje | null;
  fuentes?: string | null;
  score?: number | null;
  modelo?: string | null;
  /** E4·T1: prompt version audit ('v2' today) — only a generation stamps it. */
  promptVersion?: string | null;
}

// ---- Solicitudes de ayuda, huecos de KB y ficha (agente-ia-crm, E3) ----

/**
 * Help-request lifecycle (CHECK-backed in CRM_SolicitudesAyuda):
 * PENDIENTE from the moment la Guía escalates (the motor's
 * REQUIERE_HUMANO transition creates the row), RESUELTA once an
 * operator answers it with an indicación. Timestamps stay as `Date`
 * (Conocimiento/TareaAgente precedent — never cross to presentation.
 */
export type EstadoSolicitudAyuda = 'PENDIENTE' | 'RESUELTA';

/**
 * One CRM_SolicitudesAyuda row (E3) — the persisted help request the
 * operator answers: the escalated `consulta`, the RAG terms/score it
 * failed with, and after resolution the `indicación` la Guía must
 * obey (`RESPONDER_CON_INDICACION` re-reads it from this row).
 */
export interface SolicitudAyuda {
  id: number;
  conversacionId: number;
  /** The triggering IN message; NULL when unknown. NO FK (AgenteTareas.mensajeId precedent). */
  mensajeId: number | null;
  consulta: string;
  /** RAG search terms stored as a JSON string array (adapter-mapped). */
  terminosBuscados: string[];
  score: number | null;
  estado: EstadoSolicitudAyuda;
  /** The operator's instruction; null while PENDIENTE. */
  indicacion: string | null;
  resueltaPor: string | null;
  creadoEn: Date;
  resueltaEn: Date | null;
}

/**
 * KB-gap lifecycle (CHECK-backed in CRM_ConocimientoHuecos): ABIERTO
 * at birth (candidate to curate), CURADO once the entry lands in
 * CRM_Conocimiento, DESCARTADO when rejected.
 */
export type EstadoHuecoConocimiento = 'ABIERTO' | 'CURADO' | 'DESCARTADO';

/**
 * One CRM_ConocimientoHuecos row (E3) — the KB-gap candidate an
 * escalation leaves behind: the query the KB could NOT answer, so
 * the E5 curator knows what to add. Survives its triggering
 * solicitud (FK SET NULL on origenSolicitudId).
 */
export interface HuecoConocimiento {
  id: number;
  consulta: string;
  /** Search terms stored as a JSON string array (adapter-mapped). */
  terminos: string[];
  estado: EstadoHuecoConocimiento;
  origenSolicitudId: number | null;
  creadoEn: Date;
}

/**
 * Typed outcome of aplicarIndicacion (E3·T2) — the operator answered
 * a help request with an indicación: the RESUELTA solicitud (the
 * durable source of truth for the indicación), the ABIERTO KB-gap
 * candidate it left behind, whether the memory pin survived
 * (best-effort — the solicitud row is the durable copy), and the
 * idempotent RESPONDER_CON_INDICACION task that relaunches la Guía.
 */
export interface ResultadoAplicarIndicacion {
  solicitud: SolicitudAyuda;
  hueco: HuecoConocimiento;
  memoria: { guardada: boolean };
  tarea: ResultadoCrearTarea;
}

/**
 * The ficha fields E3 extracts from the thread (CHECK-backed in
 * CRM_ExtraccionesFicha.campo): the contacto's cargo and the
 * empresa's trabajadores/sedes counts.
 */
export type CampoFicha = 'cargo' | 'trabajadores' | 'sedes';

/** Who asserted a ficha value: la Guía's extraction or an operator. */
export type OrigenDatoFicha = 'IA' | 'HUMANO';

/**
 * One CRM_ExtraccionesFicha row (E3) — a ficha (contact-card) datum
 * extracted from the conversation. Dedup is app-level by
 * (contactoId, empresaId, campo) with NULL-safe keys; the ONE rule:
 * an IA re-extraction NEVER overwrites a row the human confirmed
 * (confirmado = 1 AND origen 'HUMANO') — human-confirmed wins.
 */
export interface ExtraccionFicha {
  id: number;
  contactoId: number | null;
  empresaId: number | null;
  campo: CampoFicha;
  valor: string;
  origen: OrigenDatoFicha;
  confirmado: boolean;
  actualizadoEn: Date;
}

/**
 * The ficha block ONE distillation may carry (E3·T4, piggyback on the
 * post-send destilar call): raw STRING values for uniformity — parsing
 * is confirm-time — and each field present ONLY when the exchange
 * stated it (undefined ⇔ not said; adapters never invent). cargo =
 * the contacto's role; trabajadores/sedes = the empresa counts.
 */
export interface FichaDestilada {
  cargo?: string | null;
  trabajadores?: string | null;
  sedes?: string | null;
}

/**
 * The destilar RESULT (E3·T4): the observation list PLUS an optional
 * ficha block. Array subtype (RegExpExecArray precedent) so every
 * existing consumer keeps working unchanged — iterate, .length,
 * toEqual([...]) — and an ABSENT ficha property ⇔ nothing extracted;
 * adapters attach `ficha` only when at least one field is a non-empty
 * string.
 */
export interface ResultadoDestilacion extends Array<ObservacionDestilada> {
  ficha?: FichaDestilada;
}

// ---- Ficha viva read side (agente-ia-crm E3·T4) ----

/**
 * Who backs one merged ficha datum (E3·T4): an IA extraction, an
 * operator confirmation, or the CANONICAL column the promotion wrote
 * (CRM_Contactos.cargo / CRM_Empresas.cantidadTrabajadores — always
 * wins over any extraction when set).
 */
export type OrigenDatoFichaVista = OrigenDatoFicha | 'canonico';

/**
 * One merged ficha datum (E3·T4): `valor` null ⇔ sin dato (origen /
 * confirmado are placeholders then — the shape stays total so the UI
 * reads Record<CampoFicha, DatoFicha> without key checks).
 */
export interface DatoFicha {
  valor: string | null;
  origen: OrigenDatoFichaVista;
  confirmado: boolean;
}

/** The contacto side of the ficha (canonical display fields, E3·T4). */
export interface ContactoFicha {
  id: number;
  nombre: string;
  telefono: string | null;
  /** Canonical CRM_Contactos.cargo (null = unset). */
  cargo: string | null;
}

/** The empresa side of the ficha (canonical display fields, E3·T4). */
export interface EmpresaFicha {
  id: number;
  razonSocial: string;
  cantidadTrabajadores: number | null;
}

/**
 * The living contact card (ficha viva, E3·T4): the conversation's
 * contacto/empresa canonical fields plus the merged per-campo view —
 * canonical column value wins for cargo/trabajadores when set
 * (origen 'canonico'); otherwise the LATEST extraction;
 * sedes always comes from extracciones (ficha-only by locked design).
 */
export interface FichaConversacion {
  conversacionId: number;
  contacto: ContactoFicha | null;
  empresa: EmpresaFicha | null;
  datos: Record<CampoFicha, DatoFicha>;
}

// ---- Base de conocimiento (agente-ia-crm, E2) ----

/**
 * One CRM_Conocimiento row — the curated KB la Guía answers from
 * (E2·T1). `etiquetas` crosses the boundary as a trimmed string[]
 * (CSV in storage, adapter-mapped); vigencia is an inclusive window
 * (NULL = unbounded on that side) and `activo` is the soft on/off
 * the RAG prefilter respects. Timestamps stay as `Date` (unlike the
 * conversación ISO strings): the ranking compares them against an
 * injected `ahora`, never crossing to the presentation layer.
 */
export interface EntradaConocimiento {
  id: number;
  titulo: string;
  contenido: string;
  /** Topic tags (CSV in storage, trimmed non-empty after mapping). */
  etiquetas: string[];
  /** Inclusive window start; NULL = always valid from the past. */
  vigenciaDesde: Date | null;
  /** Inclusive window end; NULL = no expiry. */
  vigenciaHasta: Date | null;
  /** Soft on/off — inactive entries never reach the RAG prefilter. */
  activo: boolean;
}

// ---- Memoria de conversación (agente-ia-crm, E2·T2) ----

/**
 * The distilled observation types la Guía saves to the conversation
 * memory (Engram): client facts, agreements, commitments,
 * preferences and objections — plus the E3 `indicacion_humana`, the
 * operator instruction captured when a help request is resolved
 * (kept so future answers honor it). Stored `tipo` on
 * ObservacionMemoria stays a plain string: reads (contexto/buscar)
 * may surface server-side types outside this union, only `guardar`
 * is closed over it.
 */
export type TipoObservacionDestilada =
  | 'hecho_cliente'
  | 'acuerdo'
  | 'compromiso'
  | 'preferencia'
  | 'objecion'
  | 'indicacion_humana';

/**
 * Memory scope (locked design: 2 niveles chat + empresa, aislamiento
 * por empresa): 'chat' = scoped to ONE conversation (session
 * `chat-<conversacionId>`), 'empresa' = durable across every
 * conversation of the empresa (fixed 'empresa' session).
 */
export type NivelMemoria = 'chat' | 'empresa';

/**
 * One memory observation read back from Engram (pinned context,
 * search hit). NOTE on `contexto` results: the ### Pinned render
 * carries NO observation id nor timestamp, so those entries cross
 * with `id: 0` (the caller keys them by `titulo`) and `creadoEn` at
 * epoch — search results carry the real values.
 */
export interface ObservacionMemoria {
  id: number;
  nivel: NivelMemoria;
  tipo: string;
  titulo: string;
  contenido: string;
  creadoEn: Date;
}

/**
 * Typed save outcome: 'guardado' = accepted with an observation id
 * but the bounded commit poll expired unconfirmed (non-fatal — the
 * write stands, confirmation is eventual); 'comprometido' = the
 * save-result endpoint confirmed the commit.
 */
export interface ResultadoGuardarMemoria {
  id: number;
  estado: 'guardado' | 'comprometido';
}

/**
 * ONE raw project observation as listed for the operator panel
 * (agente-ia-crm E3·T3) — the GET /observations?project=<proj> row
 * mapped. Carries the raw `sesion` (session_id) instead of a derived
 * nivel because the LISTING is project-wide: the caller (use case)
 * scopes rows to `chat-<conversacionId>` + the fixed 'empresa'
 * session, so it must see WHICH chat session each row belongs to
 * (ObservacionMemoria.nivel alone cannot distinguish chats).
 */
export interface ObservacionMemoriaEnLista {
  id: number;
  /** Raw Engram session id: 'empresa' or 'chat-<conversacionId>'. */
  sesion: string;
  tipo: string;
  titulo: string;
  contenido: string;
  creadoEn: Date;
}

/**
 * ONE memory observation shaped for the operator's "Memorias" panel
 * (agente-ia-crm E3·T3): the ObservacionMemoria row plus the
 * `pineada` flag (matched by TITULO against the /context pinned
 * block — pinned lines carry no id) with `creadoEn` crossing as an
 * ISO string (the panel is presentation-facing, unlike the Date the
 * domain compares against).
 */
export interface MemoriaLista {
  id: number;
  nivel: NivelMemoria;
  tipo: string;
  titulo: string;
  contenido: string;
  pineada: boolean;
  creadoEn: string;
}

/**
 * ONE row of the sidebar's ayuda detalle (agente-ia-crm E3·T6):
 * what the global toast needs per escalated conversation — the id
 * (deep-link target), the display etiqueta (razonSocial → contacto →
 * telefono, the same chain the bandeja derives for display) and the
 * consulta that defeated the RAG (null when the repo lacks the
 * solicitud capability or the row is absent).
 */
export interface DetalleAyudaNotificacion {
  conversacionId: number;
  etiqueta: string;
  consulta: string | null;
}

/**
 * The bandeja notification badge (agente-ia-crm E3·T3): counts over
 * CRM_Conversaciones — `requiereAyuda` (estado REQUIERE_HUMANO),
 * `pendienteVinculacion` (estado PENDIENTE_VINCULACION), `total` and
 * the latest activity tick. Presentation-facing: `ultimaActividad`
 * crosses as an ISO string (null when no conversation has messages).
 */
export interface ResumenNotificaciones {
  requiereAyuda: number;
  pendienteVinculacion: number;
  total: number;
  ultimaActividad: string | null;
  /**
   * E3·T6 (additive, optional): top-5 REQUIERE_HUMANO conversations
   * by ultimoMensajeEn DESC — feeds the global toast + deep link in
   * the shell. Absent in pre-T6 payloads; consumers treat undefined
   * as [] (ultimoMensajeCuerpo precedent).
   */
  requiereAyudaDetalle?: DetalleAyudaNotificacion[];
}

// ---- Generador de respuestas LLM (agente-ia-crm, E2·T3) ----

/**
 * One thread message as the LLM prompt sees it (E2·T3): the emisor
 * union reuses EmisorMensaje; `texto` is the already PII-scrubbed
 * body (phones masked before crossing, locked E2 decision).
 */
export interface MensajeHistorialGeneracion {
  emisor: EmisorMensaje;
  texto: string;
}

/**
 * One KB fragment the RAG ranking selected into the prompt (E2·T3):
 * the prompt projection of an EntradaConocimiento — id included so
 * the model can cite it back in `idsConocimiento`.
 */
export interface FragmentoConocimiento {
  id: number;
  titulo: string;
  contenido: string;
}

/**
 * One memory fragment (Engram observation) loaded into the prompt
 * (E2·T3): `tipo` stays a plain string — reads may surface
 * server-side types outside TipoObservacionDestilada.
 */
export interface FragmentoMemoria {
  tipo: string;
  titulo: string;
  contenido: string;
}

/** Structured input for one respuesta generation (E2·T3). */
export interface EntradaGenerarRespuesta {
  consulta: string;
  /**
   * E2·T9: this conversation has no empresa/contacto yet — the
   * adapter asks for nombre/empresa NATURALLY in its answer
   * (progressive identification). REQUIRED flag: explicit at every
   * constructor, never guessed.
   */
  contactoNuevo: boolean;
  /** Recent thread tail, as provided by the motor (last-first order). */
  historial: MensajeHistorialGeneracion[];
  conocimiento: FragmentoConocimiento[];
  memorias: FragmentoMemoria[];
  /**
   * E3·T2: the operator's instruction from a RESUELTA help request —
   * the human already authorized THIS answer (the motor skips the
   * scope/umbral gate), so the adapter gives it MAXIMUM priority
   * when drafting. Already PII-scrubbed by the motor (phones
   * masked before crossing, consulta/historial precedent). Absent
   * on the plain E2 path.
   */
  indicacionHumana?: string;
}

/**
 * Structured output of one respuesta generation (E2·T3):
 * `scoreConfianza` ∈ [0, 1]; `enScope` false means the query is NOT
 * covered by the provided conocimiento+memorias — the motor decides
 * escalation from that flag plus the confidence threshold, never
 * from the raw text alone; `idsConocimiento` cites only provided
 * fragment ids (adapters filter hallucinated ids); `modelo` is the
 * adapter's configured model name (the simulator reports
 * 'simulado') — the motor stores it per message for audit.
 */
export interface RespuestaGenerada {
  texto: string;
  scoreConfianza: number;
  enScope: boolean;
  requiereAyudaHumana: boolean;
  idsConocimiento: number[];
  modelo: string;
}

/** One client↔Guía exchange to distill (E2·T3, post-send). */
export interface EntradaDestilacion {
  consulta: string;
  respuesta: string;
}

/** One client↔Guía exchange to scan for STATED identification (E2·T9). */
export interface EntradaExtraerIdentificacion {
  consulta: string;
  respuesta: string;
}

/**
 * The identification the client STATED in one exchange (E2·T9):
 * null fields mean "not said" — adapters never deduce or invent.
 */
export interface IdentificacionExtraida {
  nombre: string | null;
  empresa: string | null;
}

/**
 * One distilled observation returned by the LLM distiller (E2·T3):
 * `pinear` true marks agreements/commitments worth pinning in the
 * conversation memory.
 */
export interface ObservacionDestilada {
  tipo: TipoObservacionDestilada;
  titulo: string;
  contenido: string;
  pinear: boolean;
}

// ---- Cola de tareas del agente (agente-ia-crm, E2·T5) ----

/**
 * The task types the durable agent queue can carry (CHECK-backed in
 * CRM_AgenteTareas). GENERAR_RESPUESTA = answer the triggering IN
 * message through the E2 motor; RESPONDER_CON_INDICACION = E3 help
 * pattern — re-answer AFTER the operator resolved the solicitud: the
 * worker re-reads the indicación from the resolved solicitud itself
 * (no extra TareaAgente fields), more types arrive with later épocas
 * (the CHECK widens with them).
 */
export type TipoTareaAgente = 'GENERAR_RESPUESTA' | 'RESPONDER_CON_INDICACION';

/**
 * Task lifecycle (CHECK-backed in CRM_AgenteTareas): PENDIENTE at
 * birth, PROCESANDO once claimed, COMPLETADA (done) or FALLIDA (3
 * failed attempts). A PROCESANDO row whose claim is stale is
 * reclaimed by the crash-recovery sweep.
 */
export type EstadoTareaAgente = 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADA' | 'FALLIDA';

/**
 * One CRM_AgenteTareas row (E2·T5) — the durable queue that decouples
 * the webhook ack from the slow LLM work: the ingesta persists the
 * task with a fast DB write, the lazy sweeper (or a route trigger)
 * claims and drains it later. UNIQUE (conversacionId, mensajeId,
 * tipo) makes creation idempotent. Timestamps cross as `Date`
 * (Conocimiento precedent): claim/cooling math compares them against
 * SYSUTCDATETIME, never crossing to the presentation layer.
 */
export interface TareaAgente {
  id: number;
  conversacionId: number;
  mensajeId: number;
  tipo: TipoTareaAgente;
  estado: EstadoTareaAgente;
  intentos: number;
  error: string | null;
  creadoEn: Date;
  reclamadaEn: Date | null;
  procesadaEn: Date | null;
}

/**
 * Typed outcome of an idempotent task creation (E2·T5): `creada`
 * false means the UNIQUE (conversacionId, mensajeId, tipo) row
 * already existed and `id` is the existing row's id.
 */
export interface ResultadoCrearTarea {
  id: number;
  creada: boolean;
}
