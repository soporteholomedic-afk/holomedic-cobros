/**
 * CRM domain entities — registro de empresas (spec G1).
 *
 * Multi-contact model: Empresa (1) → Contactos (N), Contacto (1) →
 * Correos (N). Teléfono lives at Contacto level. Pure types — no
 * framework, DB or transport imports (hexagonal domain layer).
 */

/** Exactly one per empresa (spec G1; CHECK-backed in CRM_Empresas). */
export type TipoEmpresa = 'Cliente' | 'Prospecto';

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
  /** Sends logged in the current cycle (1–3; 0 = unarmed stage). */
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
  contactos: Contacto[];
  createdAt: string;
  updatedAt: string;
}

// ---- Input DTOs (application boundary; pr3 use cases consume these) ----

export interface CrearContactoInput {
  nombre: string;
  telefono?: string | null;
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
