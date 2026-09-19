import type {
  Etapa,
  Flujo,
  ActualizarEmpresaInput,
  CrearEmpresaInput,
  Empresa,
  PipelineEmpresa,
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

export interface CrmResultadosRepositoryPort {
  registrar(fila: FilaResultadoAudit): Promise<number>;
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
export interface CrmActividadesRepositoryPort {
  /**
   * Log ONE ENVIO_CADENCIA send atomically: CRM_Actividades insert +
   * CRM_Pipeline counter update + the derived CRM_Transiciones audit
   * row (T8/T9) when the send moves the machine.
   */
  registrarEnvioCadencia(datos: EnvioCadenciaAPersistir): Promise<PipelineEmpresa>;
}
