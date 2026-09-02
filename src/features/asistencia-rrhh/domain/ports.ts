/**
 * Outbound ports (hexagonal) for the asistencia-rrhh feature.
 *
 * Use cases depend on these interfaces only; the SQL Server adapters
 * under `infrastructure/sqlserver/` implement them. Signatures follow
 * the SDD design (ADR-2: domain/DB camelCase — wire translation happens
 * in the route/adapters, never here).
 */
import type {
  Alerta,
  Comando,
  DatosFicha,
  Dispositivo,
  Empleado,
  EntradaAuditoria,
  MarcacionRaw,
  MarcacionWire,
  UsuarioEquipo,
} from './entities';

export interface IDispositivoRepository {
  /** SHA-256 byte-equality lookup against dispositivos.apiTokenHash (VARBINARY(32)). */
  porTokenHash(hash: Buffer): Promise<Dispositivo | null>;
  /** UPDATE dispositivos.ultimaSincronizacion = now; resolves to the stored timestamp. */
  registrarHeartbeat(id: number): Promise<Date>;
  /** Lightweight status projection for the dashboard's WORKER_CAIADO evaluation (ADR-5). */
  estados(): Promise<{ id: number; codigo: string; ultimaSincronizacion: Date | null }[]>;
}

export interface IMarcacionRepository {
  /**
   * Idempotent bulk insert (ADR-4): dedups via UNIQUE (userId, fechaHora, punch),
   * resolves empleadoId for known user_ids (any estado, REQ-F1-02) and returns
   * the distinct unknown user_ids so the caller can raise USER_ID_DESCONOCIDO.
   */
  insertarLote(
    dispositivoId: number,
    items: MarcacionWire[],
  ): Promise<{ insertados: number; userIdsDesconocidos: string[] }>;
  /** All punches of a calendar date (YYYY-MM-DD), for the dashboard. */
  listarDelDia(fecha: string): Promise<MarcacionRaw[]>;
  /** Historical raw search (no collapse in F1 — REQ-F1-12). */
  buscar(criterio: {
    empleadoId?: number;
    userId?: string;
    desde: string;
    hasta: string;
  }): Promise<MarcacionRaw[]>;
  /** Backfill empleado_id on punches that arrived before the ficha existed; returns rows updated. */
  reasignarEmpleado(userId: string, empleadoId: number): Promise<number>;
}

export interface IEmpleadoRepository {
  /** Creates only the missing fichas (UNIQUE userId) as PENDIENTE_FICHA; returns created count. */
  upsertPendientes(usuarios: UsuarioEquipo[]): Promise<number>;
  /** Fichas waiting for RRHH completion. */
  pendientes(): Promise<Empleado[]>;
  /** Completes the ficha and moves it to ACTIVO. */
  completar(id: number, datos: DatosFicha): Promise<Empleado>;
}

export interface IComandoRepository {
  /** Claims the device's PENDIENTE commands, marking them ENVIADO with enviadoAt. */
  pendientesYMarcarEnviados(dispositivoId: number): Promise<Comando[]>;
  /** CONFIRMADO with confirmadoAt; NO_EXISTE (unknown id) or AJENO (other device's command). */
  confirmar(id: number, dispositivoId: number): Promise<'CONFIRMADO' | 'NO_EXISTE' | 'AJENO'>;
}

export interface IAlertaRepository {
  crear(tipo: string, detalle: string, dispositivoId?: number): Promise<void>;
  /** Most recent alerts first, for the dashboard's read-only panel. */
  recientes(limite: number): Promise<Alerta[]>;
}

export interface IParametroRepository {
  /** Reads dbo.parametros_sistema.valor by clave (e.g. WORKER_CAIDO_SEG). */
  valor(clave: string): Promise<string | null>;
}

export interface IAuditoriaRepository {
  /** Appends an audit row; usuarioId is the session user (NVARCHAR(50) UUID). */
  registrar(entrada: EntradaAuditoria): Promise<void>;
}
