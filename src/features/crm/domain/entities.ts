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
