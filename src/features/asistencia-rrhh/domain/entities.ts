/**
 * Domain entities for the asistencia-rrhh feature (Fase 1 — captura).
 *
 * These are pure domain models: no SQL, no HTTP, no framework imports.
 * Column naming follows the repo convention (camelCase, ADR-2) — the
 * SQL Server adapters are the only translators between these shapes and
 * the database, and the API routes are the only translators between
 * these shapes and the snake_case wire payloads the ZKTeco worker sends.
 *
 * Time convention: naive America/Lima wall-clock timestamps (ADR-9) —
 * no timezone offsets anywhere in this feature.
 */

// ---------------------------------------------------------------------------
// Value sets pinned by DB CHECK constraints (see sqlserver/migrate.ts)
// ---------------------------------------------------------------------------

/** Lifecycle of an employee record. New device-reported users start as PENDIENTE_FICHA. */
export const ESTADOS_EMPLEADO = ['PENDIENTE_FICHA', 'ACTIVO', 'INACTIVO', 'SUSPENDIDO'] as const;
export type EstadoEmpleado = (typeof ESTADOS_EMPLEADO)[number];

/** How a punch was verified on the device (wire `tipo_verificacion`). */
export const TIPOS_VERIFICACION = ['HUELLA', 'TARJETA', 'PIN'] as const;
export type TipoVerificacion = (typeof TIPOS_VERIFICACION)[number];

/** Lifecycle of a remote command sent to a device. */
export const ESTADOS_COMANDO = ['PENDIENTE', 'ENVIADO', 'CONFIRMADO', 'ERROR'] as const;
export type EstadoComando = (typeof ESTADOS_COMANDO)[number];

/** Commands the backend can deliver to a device. */
export const TIPOS_COMANDO = ['DESACTIVAR_USER', 'SET_TIME', 'SYNC_COMPLETO'] as const;
export type TipoComando = (typeof TIPOS_COMANDO)[number];

/** Alerts Fase 1 creates and the dashboard displays read-only. */
export const TIPOS_ALERTA = ['USER_ID_DESCONOCIDO', 'DRIFT_RELOJ', 'WORKER_CAIADO'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Employee record. Created from the device's user report (userId +
 * nombre only, estado PENDIENTE_FICHA); RRHH completes the rest.
 * `fechaIngreso`/`fechaBaja` are plain calendar dates (YYYY-MM-DD
 * strings at the domain boundary — the adapter owns the DATE mapping).
 */
export interface Empleado {
  id: number;
  /** Device enrollment id — the only identity key before RRHH adds the DNI. */
  userId: string;
  dni: string | null;
  nombres: string | null;
  apellidos: string | null;
  area: string | null;
  cargo: string | null;
  fechaIngreso: string | null;
  fechaBaja: string | null;
  estado: EstadoEmpleado;
  /** Extras policy placeholder seeded as 'PAGAR' (semantics land in F2/F3). */
  modoExtras: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Biometric device (ZKTeco K20 Pro). `apiTokenHash` is intentionally
 * absent from the domain model — the SHA-256 hash is an auth secret
 * consumed by the adapter's `porTokenHash` lookup and never exposed
 * to use cases or UI.
 */
export interface Dispositivo {
  id: number;
  codigo: string;
  sede: string | null;
  ip: string | null;
  activo: boolean;
  ultimaSincronizacion: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Raw punch as captured, before any F2 collapse engine touches it.
 * `empleadoId` is NULL until a matching Empleado.userId exists — the
 * backfill happens when RRHH completes the ficha.
 */
export interface MarcacionRaw {
  id: number;
  dispositivoId: number;
  userId: string;
  empleadoId: number | null;
  fechaHora: Date;
  punch: number;
  tipoVerificacion: TipoVerificacion;
  procesada: boolean;
  createdAt: Date;
}

/** Remote command queued for a device (DESACTIVAR_USER / SET_TIME / SYNC_COMPLETO). */
export interface Comando {
  id: number;
  dispositivoId: number;
  tipo: TipoComando;
  /** JSON payload string (NVARCHAR(MAX) in DB; opaque to the domain). */
  payload: string | null;
  estado: EstadoComando;
  createdAt: Date;
  enviadoAt: Date | null;
  confirmadoAt: Date | null;
}

/** Capture alert (unknown user, clock drift, worker down). Read-only in F1. */
export interface Alerta {
  id: number;
  /** Free-form by design in F1 (no DB CHECK) — producers use TIPOS_ALERTA. */
  tipo: string;
  empleadoId: number | null;
  dispositivoId: number | null;
  detalle: string | null;
  fecha: Date;
  atendida: boolean;
}

// ---------------------------------------------------------------------------
// Auxiliary domain inputs
// ---------------------------------------------------------------------------

/** User report coming from a device (bootstrap channel), in domain casing. */
export interface UsuarioEquipo {
  userId: string;
  nombre: string;
}

/** Ficha completion input from RRHH (REQ-F1-10). dni/apellidos/area/fechaIngreso are required. */
export interface DatosFicha {
  dni: string;
  apellidos: string;
  area: string;
  /** Calendar date YYYY-MM-DD. */
  fechaIngreso: string;
  nombres?: string;
  cargo?: string;
}

/** Audit trail entry for RRHH mutations (dbo.auditoria row). */
export interface EntradaAuditoria {
  tabla: string;
  registroId?: number;
  accion: string;
  datosAnteriores?: string | null;
  datosNuevos?: string | null;
  /** Session user id — dbo.usuarios.idUsuario (NVARCHAR(50) UUID). */
  usuarioId: string;
}

// ---------------------------------------------------------------------------
// Wire contracts (snake_case, ADR-2 — the worker's HTTP payloads)
// ---------------------------------------------------------------------------

/** One punch in the `POST /api/asistencia/marcaciones` body. */
export interface MarcacionWire {
  user_id: string;
  /** Naive America/Lima timestamp, "YYYY-MM-DDTHH:mm:ss". */
  fecha_hora: string;
  punch: number;
  tipo_verificacion: TipoVerificacion;
}
