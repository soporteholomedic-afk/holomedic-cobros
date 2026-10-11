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
 */
export interface ConversacionListada extends ConversacionCrm {
  razonSocial: string | null;
  nombreContacto: string | null;
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
 * preferences and objections — the five categories the E2 distiller
 * emits. Stored `tipo` on ObservacionMemoria stays a plain string:
 * reads (contexto/buscar) may surface server-side types outside this
 * union, only `guardar` is closed over it.
 */
export type TipoObservacionDestilada =
  | 'hecho_cliente'
  | 'acuerdo'
  | 'compromiso'
  | 'preferencia'
  | 'objecion';

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
