import type {
  EntradaConocimiento,
  Etapa,
  Flujo,
  AccionAsignacion,
  ActualizarEmpresaInput,
  CanalConversacion,
  ConversacionCrm,
  ConversacionListada,
  CrearConversacionInput,
  CrearEmpresaInput,
  CrearMensajeInput,
  Empresa,
  EstadoConversacion,
  MensajeCrm,
  PipelineEmpresa,
  SectorCrm,
  TipoEmpresa,
} from './entities';
import type { ErrorFilaImport, GrupoEmpresaImportado } from './importar/validarImportacion';
import type { EfectosDenormalizados } from './efectosTransicion';
import type { EstadoPipeline, EventoPipeline, TipoResultado } from './maquinaEstados';
import type { TransicionDerivada } from './envioCadencia';

/** Filters for the empresa list (spec G1; etapa filter arrives with the pipeline in pr9+). */
export interface FiltrosEmpresas {
  /** Free-text match over razonSocial / RUC. */
  q?: string;
  tipo?: TipoEmpresa;
  /** Exact username; null filters unassigned (pool) empresas. */
  responsable?: string | null;
}

/**
 * Outbound port for the empresa registry. Implemented by the SQL Server
 * adapter (pr3); consumed by the CRUD use cases through this contract so
 * application logic stays persistence-agnostic (hexagonal boundary).
 */
export interface CrmEmpresaRepositoryPort {
  crear(datos: CrearEmpresaInput): Promise<Empresa>;
  listar(filtros?: FiltrosEmpresas): Promise<Empresa[]>;
  obtenerPorId(id: number): Promise<Empresa | null>;
  actualizar(id: number, cambios: ActualizarEmpresaInput): Promise<Empresa | null>;
  /**
   * Upsert ONE operational contacto by (empresaId, cargo) — crm-ux
   * redesign (DatosSolicitados capture). Optional: only the SQL
   * adapter implements it; test fakes stay valid without it.
   */
  guardarContactoOperativo?(
    empresaId: number,
    cargo: string,
    dato: { nombre: string | null; correo: string | null },
  ): Promise<void>;
}

/**
 * Outcome of ONE RUC-group import transaction, executed by the adapter
 * inside `withCrmTransaction` (design §2a). `advertencias` are the
 * non-blocking D1 duplicate rows ("Posible contacto duplicado") found
 * while merging against the empresa's existing contactos.
 */
export interface ResultadoGrupoImport {
  modo: 'crear' | 'actualizar';
  contactosCreados: number;
  contactosActualizados: number;
  advertencias: ErrorFilaImport[];
}

/** The CRM_Importaciones job record (design §2) — audit of one import run. */
export interface RegistroImportacion {
  archivoNombre: string;
  totalFilas: number;
  filasValidas: number;
  empresasCreadas: number;
  empresasActualizadas: number;
  contactosCreados: number;
  contactosActualizados: number;
  /** JSON array of report rows [{fila, columna, mensaje}]: errores + fallos + advertencias. */
  erroresJson: string;
  ejecutadoPor: string;
}

/**
 * Outbound port for the import execution (tasks pr6, spec G2).
 * `ejecutarGrupo` owns the PER-GROUP transaction so one bad group
 * never rolls back valid groups; `registrarImportacion` writes the
 * job record AFTER all groups (single-statement insert). Implemented
 * by `SqlServerCrmImportador` (infrastructure/importar).
 */
export interface CrmImportadorPort {
  ejecutarGrupo(grupo: GrupoEmpresaImportado, usuario: string): Promise<ResultadoGrupoImport>;
  registrarImportacion(registro: RegistroImportacion): Promise<number>;
}

/**
 * Injected clock — cadence math and audit stamps stay deterministic in
 * tests (design §3: hoy injected, no hidden Date.now in the domain).
 */
export type Clock = () => Date;

// ---------------------------------------------------------------------------
// Pipeline ports (tasks pr10, spec G4) — one SQL Server adapter
// (`SqlServerPipelineRepository`) implements all four so the atomic
// transition write composes pipeline + audit + result + handoff inside
// a single `withCrmTransaction` (design §2b).
// ---------------------------------------------------------------------------

/** Handoff payload carried by T5 (design D3: área + nota). */
export interface HandoffInput {
  area: string;
  nota?: string | null;
}

/** Everything the adapter must persist for ONE applied transition. */
export interface TransicionAPersistir {
  empresaId: number;
  /** Acting session user — CRM_Transiciones.usuario / updatedBy. */
  usuario: string;
  /** The pinned machine event name (CRM_Transiciones.evento, VC(40)). */
  evento: EventoPipeline;
  /** T14's validated motivo (Spanish), else null. */
  motivo: string | null;
  /** Injected business date (DATE-only) — CRM_Resultados.fecha. */
  hoy: string;
  estadoPrevio: EstadoPipeline;
  estadoNuevo: EstadoPipeline;
  /** Bold T-row only (design D3 catalog), else null. */
  resultado: TipoResultado | null;
  /** Denormalized counter/marker projection (domain efectosTransicion). */
  efectos: EfectosDenormalizados;
  /** T5's handoff payload, else null. */
  handoff: HandoffInput | null;
}

/** T16 payload: the empresa's tipo change (+ optional conversion event). */
export interface CambiarTipoDatos {
  empresaId: number;
  nuevoTipo: TipoEmpresa;
  usuario: string;
  hoy: string;
  /** true (Prospecto→Cliente) → emit the ConversiónProspectoACliente row. */
  convertir: boolean;
}

/**
 * A queue candidate (tasks pr13/WU2): the pipeline row joined with the
 * display fields the /crm/cola page renders per row. The SQL adapter
 * reads it through the covering queue index IX_CRM_Pipeline_Etapa
 * (design §2: the daily scan never leaves the index on the pipeline
 * side; the join lands on the CRM_Empresas PK).
 */
export interface CandidatoCola extends PipelineEmpresa {
  razonSocial: string;
  responsable: string | null;
  /**
   * Principal encargado display fields (crm-ux redesign — the "who
   * to write" on the board cards): nombre and first correo of the
   * exactly-one-principal contacto, null when the empresa has none.
   * Optional so non-SQL fakes stay valid; the SQL adapter always set
   * them (principal = first esPrincipal, else first listed).
   */
  contactoNombre?: string | null;
  contactoCorreo?: string | null;
}

/**
 * Outbound port for the pipeline row (design D3 1:1). `registrarTransicion`
 * is the atomic unit — the use case computes the whole bundle (machine +
 * effects) and the adapter writes pipeline row, audit row and the optional
 * result/handoff rows in ONE transaction: a mid-flight failure leaves the
 * pipeline untouched (spec G4 audit integrity).
 *
 * The history READS live here too (tasks pr11): the ONE adapter class
 * owns all four pipeline tables, and two same-named `listarPorEmpresa`
 * methods with different return types could not coexist on it — so the
 * detail timeline consumes this port instead of the write-side audit
 * ports (documented tasks deviation).
 */
export interface CrmPipelineRepositoryPort {
  obtenerPorEmpresaId(empresaId: number): Promise<PipelineEmpresa | null>;
  registrarTransicion(datos: TransicionAPersistir): Promise<PipelineEmpresa>;
  /** T16 — CRM_Empresas.tipo UPDATE + optional conversion result row, one tx. */
  cambiarTipo(datos: CambiarTipoDatos): Promise<void>;
  /** Transition audit history, newest first (spec G4 timeline). */
  listarTransiciones(empresaId: number): Promise<TransicionHistorial[]>;
  /** Handoff records, newest first (spec G4 timeline). */
  listarHandoffs(empresaId: number): Promise<HandoffHistorial[]>;
  /**
   * Every pipeline row with its empresa display fields — the raw
   * material the queue use case classifies with the pr12 predicates
   * (pr13/WU2; derived on request, zero background jobs).
   */
  listarCandidatosCola(): Promise<CandidatoCola[]>;
}

/**
 * One CRM_Transiciones audit row as READ for the detail timeline
 * (spec G4: who, when, from, to). Mirrors the write payload plus the
 * BIGINT id and the audit stamp.
 */
export interface TransicionHistorial {
  id: number;
  empresaId: number;
  /** NULL for the creation transitions (T1/T6). */
  flujoPrevio: Flujo | null;
  etapaPrevia: Etapa | null;
  flujoNuevo: Flujo;
  etapaNueva: Etapa;
  evento: string;
  motivo: string | null;
  usuario: string;
  createdAt: string;
}

/** One CRM_Handoffs row as READ for the detail timeline (spec G4). */
export interface HandoffHistorial {
  id: number;
  empresaId: number;
  area: string;
  nota: string | null;
  usuario: string;
  createdAt: string;
}

/** One CRM_Transiciones audit row (spec G4: who, when, from, to). */
export interface FilaTransicionAudit {
  empresaId: number;
  /** NULL for the creation transitions (T1/T6). */
  flujoPrevio: Flujo | null;
  etapaPrevia: Etapa | null;
  flujoNuevo: Flujo;
  etapaNueva: Etapa;
  evento: string;
  motivo: string | null;
  usuario: string;
}

export interface CrmTransicionesRepositoryPort {
  registrar(fila: FilaTransicionAudit): Promise<number>;
}

/** One CRM_Resultados row (design D4 catalog — productivity events). */
export interface FilaResultadoAudit {
  empresaId: number;
  tipo: TipoResultado;
  usuario: string;
  /** DATE-only business date. */
  fecha: string;
}

/** One CRM_Resultados GROUP BY usuario, tipo row (productivity read, spec G6). */
export interface ConteoResultadoUsuario {
  usuario: string;
  tipo: TipoResultado;
  total: number;
}

export interface CrmResultadosRepositoryPort {
  registrar(fila: FilaResultadoAudit): Promise<number>;
  /**
   * Result-event counts GROUP BY usuario, tipo inside the inclusive
   * [desde, hasta] DATE window (spec G6 productivity; optional user
   * filter is the scoping policy's own-only read). Rows come back
   * usuario-sorted; the IX(usuario, fecha DESC) index backs the scan.
   */
  contarResultadosPorUsuario(
    desde: string,
    hasta: string,
    usuario?: string,
  ): Promise<ConteoResultadoUsuario[]>;
}

/** One CRM_Handoffs row (spec G4: handoff record — área, nota, user). */
export interface FilaHandoffAudit {
  empresaId: number;
  area: string;
  nota: string | null;
  usuario: string;
}

export interface CrmHandoffsRepositoryPort {
  registrar(fila: FilaHandoffAudit): Promise<number>;
}

// ---------------------------------------------------------------------------
// Activities port (tasks pr13/WU1, spec G4) — the ENVIO_CADENCIA write is
// genuinely cross-table (activity row + pipeline counters + the derived
// T8/T9 audit row), so the SAME adapter class that owns the pipeline tables
// implements this port too and composes everything inside ONE
// `withCrmTransaction` (design §2c).
// ---------------------------------------------------------------------------

/** The CRM_Actividades row written by a logged cadence send. */
export interface ActividadEnvioInput {
  /** Spanish subject; the use case defaults it from the counters. */
  asunto: string;
  /** Optional free-form note, trimmed by the use case (null when blank). */
  detalle: string | null;
  /** Optional addressee (defaults to the principal contacto app-side). */
  contactoId: number | null;
}

/** Everything the adapter must persist for ONE logged cadence send. */
export interface EnvioCadenciaAPersistir {
  empresaId: number;
  /** Acting session user — CRM_Actividades.usuario / updatedBy. */
  usuario: string;
  /** Injected business date (DATE-only) — CRM_Actividades.fecha. */
  hoy: string;
  /**
   * Final pipeline state: the derived move's `estadoNuevo` when the
   * send fires T8/T9, else the row's unchanged state (a plain weekly
   * send moves no machine state).
   */
  estadoFinal: EstadoPipeline;
  actividad: ActividadEnvioInput;
  /** Denormalized counter/marker projection (domain envioCadencia). */
  efectos: EfectosDenormalizados;
  /** The derived T8/T9 move, or null for a plain weekly send. */
  transicion: TransicionDerivada | null;
}

/**
 * Outbound port for CRM_Actividades (design §2). pr13 scopes it to the
 * cadence send; later slices add the general activity registration.
 */
/** One CRM_Actividades GROUP BY usuario row (productivity read, spec G6). */
export interface ConteoActividadUsuario {
  usuario: string;
  total: number;
}

export interface CrmActividadesRepositoryPort {
  /**
   * Log ONE ENVIO_CADENCIA send atomically: CRM_Actividades insert +
   * CRM_Pipeline counter update + the derived CRM_Transiciones audit
   * row (T8/T9) when the send moves the machine.
   */
  registrarEnvioCadencia(datos: EnvioCadenciaAPersistir): Promise<PipelineEmpresa>;
  /**
   * Activity counts GROUP BY usuario inside the inclusive
   * [desde, hasta] DATE window (spec G6 productivity; optional user
   * filter is the scoping policy's own-only read). Rows come back
   * usuario-sorted; the IX(usuario, fecha DESC) index backs the scan.
   */
  contarActividadesPorUsuario(
    desde: string,
    hasta: string,
    usuario?: string,
  ): Promise<ConteoActividadUsuario[]>;
}

// ---------------------------------------------------------------------------
// Assignment port (tasks pr14/WU2, spec G5) — the assignment write is
// genuinely cross-table (CRM_Empresas.responsable UPDATE + CRM_Asignaciones
// event INSERT), so it composes inside ONE `withCrmTransaction` (design
// §2d): the current-owner column and the history row can never diverge.
// ---------------------------------------------------------------------------

/** Everything the adapter must persist for ONE assignment event. */
export interface AsignacionAPersistir {
  empresaId: number;
  accion: AccionAsignacion;
  /** Owner before the event; NULL when the empresa came from the pool. */
  responsablePrevio: string | null;
  /** Owner after the event; NULL = back to the pool. */
  responsableNuevo: string | null;
  /** Acting session user (CRM_Asignaciones.actorUsuario). */
  actorUsuario: string;
}

/**
 * One CRM_Asignaciones row as READ for the per-empresa history (spec G5
 * reassignment-history scenario: all events in order with actor and
 * timestamp). BIGINT id crosses tedious as a string; the adapter maps it.
 */
export interface AsignacionHistorial {
  id: number;
  empresaId: number;
  accion: AccionAsignacion;
  responsablePrevio: string | null;
  responsableNuevo: string | null;
  actorUsuario: string;
  createdAt: string;
}

/**
 * Outbound port for the assignment model (spec G5: at most ONE
 * Responsable at a time; NULL = pool; every event traceable).
 */
export interface CrmAsignacionesRepositoryPort {
  /**
   * Persist ONE assignment event atomically: the CRM_Empresas
   * `.responsable` UPDATE and the CRM_Asignaciones INSERT in a single
   * `withCrmTransaction`. `NotFoundError` when the empresa does not
   * exist (rowsAffected 0 on the UPDATE).
   */
  registrarAsignacion(datos: AsignacionAPersistir): Promise<void>;
  /** Assignment history for one empresa, newest first (spec G5). */
  listarAsignaciones(empresaId: number): Promise<AsignacionHistorial[]>;
}

// ---------------------------------------------------------------------------
// Email sequencing ports (rediseno-crm-panel, design D3/D5) — the SMTP
// dispatch and its durable send-log are different concerns, so they get
// separate ports: `EnviadorCorreoCrmPort` wraps the app-wide sendEmail
// utility behind a domain contract (purpose 'crm'), and
// `CrmEnviosCorreoRepositoryPort` owns the CRM_EnviosCorreos rows. The
// SQL Server adapter implements the repository port on the SAME
// SqlServerPipelineRepository class (ADR-3 one-class-many-ports).
// ---------------------------------------------------------------------------

/** The 5 CRM templates (design D5; CHECK-backed in CRM_EnviosCorreos). */
export type PlantillaCrmKey =
  | 'carta_presentacion'
  | 'seguimiento_1'
  | 'seguimiento_2'
  | 'seguimiento_3'
  | 'reactivacion_3m';

/** Everything the template render + SMTP send need for ONE dispatch. */
export interface EnvioCrmCorreo {
  /** Normalized principal-contacto address (the only recipient in v1). */
  destinatario: string;
  plantilla: PlantillaCrmKey;
  /** Interpolation values for the verbatim template copy. */
  empresa: string;
  contacto: string;
  sector: string | null;
  trabajadores: number | null;
}

/**
 * Typed SMTP outcome (design D5): the adapter surfaces the app-wide
 * sendEmail error codes verbatim — the use case turns the failure arm
 * into a FALLIDO log row and NEVER advances the machine.
 */
export type ResultadoEnvioCrm =
  | { ok: true; messageId: string }
  | { ok: false; error: 'SMTP_AUTH_ERROR' | 'SMTP_TIMEOUT' | 'SMTP_ERROR'; detalle: string };

/** Outbound port for the CRM SMTP dispatch (purpose 'crm', dedicated sender). */
export interface EnviadorCorreoCrmPort {
  enviar(datos: EnvioCrmCorreo): Promise<ResultadoEnvioCrm>;
}

// ---------------------------------------------------------------------------
// WhatsApp outbound port (agente-ia-crm E1) — the mirror of
// EnviadorCorreoCrmPort for the Kapso canal: the use cases depend on
// this contract, and TWO adapters implement it (the real Kapso SDK
// adapter and the simulator selected by KAPSO_MODO — see
// infrastructure/whatsapp/crearEnviadorWhatsapp.ts).
// ---------------------------------------------------------------------------

/** One outbound WhatsApp text (the reply the bandeja sends). */
export interface EnvioWhatsappCrm {
  /** Normalized E.164 with '+' (the conversation's stored telefono). */
  telefonoE164: string;
  /** Verbatim text body (≤4000 chars — NVARCHAR(4000) in CRM_Mensajes). */
  cuerpo: string;
}

/**
 * Typed WhatsApp send outcome (E1): the adapter maps every failure
 * to ONE of these codes — the responder use case turns the failure
 * arm into a FALLIDO audit row and returns ok:false instead of
 * throwing (the bandeja must show the failed attempt).
 */
export type ResultadoEnvioWhatsapp =
  | { ok: true; wamid: string }
  | {
      ok: false;
      error: 'KAPSO_NO_CONFIGURADO' | 'KAPSO_AUTH_ERROR' | 'KAPSO_TIMEOUT' | 'KAPSO_ERROR';
      detalle: string;
    };

/** Outbound port for the CRM WhatsApp dispatch (Kapso canal, E1). */
export interface EnviadorWhatsappCrmPort {
  enviar(datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp>;
}

/** One CRM_EnviosCorreos write (design D3 columns). */
export interface FilaEnvioCorreoAudit {
  empresaId: number;
  /** Addressee contacto when known; NULL = resolve failed after send. */
  contactoId: number | null;
  plantilla: PlantillaCrmKey;
  destinatario: string;
  messageId: string | null;
  estado: 'ENVIADO' | 'FALLIDO';
  errorInfo: string | null;
  usuario: string;
}

/** One CRM_EnviosCorreos row as READ for the ficha timeline (spec OP-6). */
export interface EnvioCorreoHistorial {
  id: number;
  plantilla: PlantillaCrmKey;
  destinatario: string;
  estado: 'ENVIADO' | 'FALLIDO';
  createdAt: string;
}

/**
 * Outbound port for the per-email dispatch log (spec crm-email-sequencing
 * send-log persistence: template key, recipient, message id, timestamp
 * + acting user, every dispatched email).
 */
export interface CrmEnviosCorreoRepositoryPort {
  /** Insert ONE dispatch row (ENVIADO or FALLIDO); returns the BIGINT id. */
  registrar(fila: FilaEnvioCorreoAudit): Promise<number>;
  /** Send-log for one empresa, newest first (ficha timeline). */
  listarPorEmpresa(empresaId: number): Promise<EnvioCorreoHistorial[]>;
}

// ---------------------------------------------------------------------------
// Panel read port (rediseno-crm-panel task 7.1, design D4) — the ONE-fetch
// aggregate the /crm panel renders from. Its own port (ADR-3
// one-class-many-ports; the send-log precedent) because the read is a
// distinct capability: every empresa LEFT JOIN its pipeline projection, so
// pipeline-less rows still appear (derivation row 0). Implemented by the
// same SqlServerPipelineRepository class.
// ---------------------------------------------------------------------------

/**
 * One panel row (design D4): the empresa display fields + pipeline
 * projection + principal contacto. All pipeline fields are null when the
 * empresa has no CRM_Pipeline row (origen null) — the exact shape
 * `EntradaEstadoPanel` maps to derivation row 0 (sin_carta). DATE columns
 * cross as `YYYY-MM-DD` strings (adapter-owned mapping, pipeline
 * precedent).
 */
export interface FilaPanelCrm {
  empresaId: number;
  razonSocial: string;
  /** Raw RUC — the panel search matches it client-side (spec OP-3). */
  ruc: string;
  tipo: TipoEmpresa;
  responsable: string | null;
  sector: SectorCrm | null;
  cantidadTrabajadores: number | null;
  createdAt: string;
  /** Pipeline projection — all seven machine fields null without a row. */
  flujo: Flujo | null;
  etapa: Etapa | null;
  ciclo: number | null;
  enviosCiclo: number | null;
  fechaCicloInicio: string | null;
  fechaUltimoEnvio: string | null;
  descansoHasta: string | null;
  rechazadoHasta: string | null;
  motivoRechazo: string | null;
  /** Principal contacto (esPrincipal DESC, id — listarCandidatosCola rule). */
  contactoNombre: string | null;
  contactoCargo: string | null;
  contactoCorreo: string | null;
}

export interface CrmPanelRepositoryPort {
  /** Every empresa with its panel projection, ordered by id (stable). */
  listarEmpresasPanel(): Promise<FilaPanelCrm[]>;
}

// ---------------------------------------------------------------------------
// Conversaciones ports (agente-ia-crm E1) — the channel foundation: the
// webhook flow and the bandeja read/operate the CRM_Conversaciones /
// CRM_Mensajes rows through these two contracts. Separate ports because
// they are separate capabilities (thread persistence vs conversation
// lifecycle); one SQL adapter implements each (ADR-3 one-class-one-port
// here — no cross-table write composes both yet).
// ---------------------------------------------------------------------------

/**
 * Lookup key for the inbound-routing match: exactly one of the two
 * (the webhook prefers telefono — the vinculación key — and falls
 * back to the canal-scoped remote id).
 */
export interface BuscarConversacionCanal {
  identificadorCanal?: string;
  telefono?: string;
}

/** Bandeja filters (E1): live search over the display fields + paging. */
export interface FiltrosConversaciones {
  /** Free-text match over empresa.razonSocial / contacto.nombre / telefono. */
  busqueda?: string;
  estado?: EstadoConversacion;
  limite?: number;
  offset?: number;
}

/**
 * Bandeja page (E1): the widened rows plus the TOTAL under the same
 * filters (count query) so the view can paginate without a second
 * unfiltered fetch.
 */
export interface ListadoConversaciones {
  items: ConversacionListada[];
  total: number;
}

/** The vinculación payload (E1: asociar a empresa/contacto existentes). */
export interface VincularConversacionDatos {
  empresaId: number;
  contactoId: number;
  /** Optional re-key (e.g. the operator corrected the phone). */
  telefono?: string;
  /** Optional state change in the same write (defaults: unchanged). */
  estado?: EstadoConversacion;
}

/**
 * One CRM_Contactos row (joined to its empresa) whose free-text phone
 * matches the incoming E.164 — the autovinculación candidate list
 * (agente-ia-crm T2). The adapter normalizes both sides in TS because
 * CRM_Contactos.telefono is free text; a normalized column is the
 * documented optimization if the table grows.
 */
export interface CandidatoVinculacion {
  empresaId: number;
  contactoId: number;
  nombreContacto: string;
  razonSocial: string;
  telefono: string;
}

/**
 * One CRM_Contactos row joined to its empresa, as read by the
 * operator vinculación flow (E1): `obtenerContactoPorId` resolves the
 * contacto's OWN empresaId (the authoritative link — never trusted
 * from the request) and the display fields the bandeja shows.
 */
export interface ContactoConEmpresa {
  contactoId: number;
  empresaId: number;
  nombreContacto: string;
  razonSocial: string | null;
  telefono: string | null;
}

/**
 * Outbound port for the conversation lifecycle (CRM_Conversaciones).
 * `buscarPorCanal` returns the most recent row matching the canal key
 * (the filtered unique indexes keep it unique in practice; the ORDER
 * BY is the determinism backstop). Every write touches `actualizadoEn`.
 */
export interface ConversacionCrmRepository {
  crear(datos: CrearConversacionInput): Promise<ConversacionCrm>;
  obtenerPorId(id: number): Promise<ConversacionCrm | null>;
  buscarPorCanal(
    canal: CanalConversacion,
    clave: BuscarConversacionCanal,
  ): Promise<ConversacionCrm | null>;
  listar(filtros?: FiltrosConversaciones): Promise<ListadoConversaciones>;
  vincular(id: number, datos: VincularConversacionDatos): Promise<ConversacionCrm | null>;
  actualizarEstado(
    id: number,
    estado: EstadoConversacion,
    asignadaA?: string | null,
  ): Promise<ConversacionCrm | null>;
  marcarMensajesLeidos(id: number): Promise<void>;
  /**
   * Inbound/outbound-activity tick (agente-ia-crm E1): ultimoMensajeEn
   * = now in every direction; noLeidos + 1 ONLY for 'IN' (an operator
   * reply does not grow its own unread badge). Defaults to 'IN' so the
   * T2 webhook call site stays the same.
   */
  registrarActividad(id: number, direccion?: 'IN' | 'OUT'): Promise<void>;
  /**
   * Autovinculación candidates (T2): contactos whose free-text phone
   * normalizes to the SAME digit key as the incoming E.164. The SQL
   * fetches every contacto with telefono (the match runs in TS —
   * free-text column, see CandidatoVinculacion for the optimization
   * note); an empty telefono is not searchable at all.
   */
  buscarCandidatosVinculacion(telefonoE164: string): Promise<CandidatoVinculacion[]>;
  /**
   * Vincular-creando (E1): INSERT one CRM_Contactos (nombreNormalizado
   * derived by the adapter — never trusted) and return its identity.
   * telefono stays null: the vinculación flow re-keys the CONVERSATION
   * phone, not the contacto.
   */
  crearContacto(
    empresaId: number,
    datos: { nombre: string; cargo?: string | null },
  ): Promise<{ contactoId: number }>;
  /** The contacto + its empresa for modo asociar (E1). */
  obtenerContactoPorId(contactoId: number): Promise<ContactoConEmpresa | null>;
  /**
   * Free-text contacto search for the operator vinculación panel
   * (E1 PanelVinculacion): LIKE over contacto.nombre /
   * empresa.razonSocial (JOIN CRM_Contactos × CRM_Empresas), TOP
   * `limite` (default 20) by razón social then nombre. Optional for
   * the same reason as `guardarContactoOperativo?`: only the SQL
   * adapter implements it; test fakes stay valid without it.
   */
  buscarContactosTexto?(
    busqueda: string,
    limite?: number,
  ): Promise<ContactoConEmpresa[]>;
}

/** Backward (older-first) pagination window for the thread read. */
export interface ListarMensajesOpciones {
  limite: number;
  /** Exclusive cursor: return rows with id < antesDeId (page 1: omit). */
  antesDeId?: number;
}

/**
 * Outbound port for the thread rows (CRM_Mensajes). `existePor…`
 * backs the webhook X-Idempotency-Key dedup (checked BEFORE insert;
 * the filtered unique index is the race backstop). `listarPor…`
 * pages the hilo newest-first (DESC) — the view renders reversed.
 */
export interface MensajeCrmRepository {
  crear(datos: CrearMensajeInput): Promise<MensajeCrm>;
  /** Outbox-lite (R4): flip ONE OUT row a 'ENVIADO' (wamid) o 'FALLIDO'; null si no existe. */
  actualizarEnvio(
    id: number,
    datos: { estadoEnvio: 'ENVIADO' | 'FALLIDO'; wamid?: string | null },
  ): Promise<MensajeCrm | null>;
  existePorIdempotenciaKey(key: string): Promise<boolean>;
  listarPorConversacion(
    conversacionId: number,
    opciones: ListarMensajesOpciones,
  ): Promise<MensajeCrm[]>;
}

// ---------------------------------------------------------------------------
// Knowledge-base port (agente-ia-crm E2·T1) — the curated KB la Guía
// answers from. Read-only by design in E2: the ranking use case only
// needs the prefilter; the CRUD editor arrives in E5. One SQL adapter
// implements it (SqlServerConocimientoRepository).
// ---------------------------------------------------------------------------

/**
 * Outbound port for the knowledge base (CRM_Conocimiento).
 * `buscarPorTexto` is the RAG PREFILTER only — a case-insensitive
 * LIKE over titulo/contenido with properly escaped wildcards (E1
 * lesson); term-overlap ranking and vigencia filtering live in the
 * application layer (recuperarConocimiento). Both reads only ever
 * return activo entries.
 */
export interface ConocimientoCrmRepository {
  /** Every active entry, id-ordered (the E5 editor stats base). */
  listarActivas(): Promise<EntradaConocimiento[]>;
  /** Active entries whose titulo/contenido match the escaped text. */
  buscarPorTexto(texto: string): Promise<EntradaConocimiento[]>;
}
