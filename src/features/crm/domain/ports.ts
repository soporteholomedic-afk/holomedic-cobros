import type {
  AuditoriaConfigCrm,
  DatosEmpresa,
  DatosOportunidad,
  DatosSunat,
  Empresa,
  EntradaConfigCrm,
  IconoSector,
  Interaccion,
  NuevaEmpresa,
  NuevaInteraccion,
  NuevaOportunidad,
  Oportunidad,
  Relacion,
  Sector,
  SeguimientoOportunidad,
} from './entities';
import type { ActividadServicios } from './actividadServicios';

export interface ICrmEmpresaRepository {
  getById(id: string): Promise<Empresa | null>;
  /** `null` when no empresa has it; a `null` RUC never matches anything. */
  findByRuc(ruc: string | null): Promise<Empresa | null>;
  /** All empresas with their contacts. */
  list(): Promise<Empresa[]>;
  /** Throws `RucDuplicadoError` when the RUC is already stored. */
  create(input: NuevaEmpresa): Promise<Empresa>;
  /**
   * Replace the empresa data and its whole contacts list in one step.
   * Throws `EmpresaNotFoundError` for an unknown id and `RucDuplicadoError`
   * when the new RUC belongs to another empresa.
   */
  update(id: string, datos: DatosEmpresa): Promise<Empresa>;
  /** Write the commercial relationship. Throws `EmpresaNotFoundError`. */
  updateRelacion(id: string, relacion: Relacion): Promise<Empresa>;
  addInteraccion(idEmpresa: string, interaccion: NuevaInteraccion): Promise<Interaccion>;
  /** Activity history of an empresa, newest first. */
  listInteracciones(idEmpresa: string): Promise<Interaccion[]>;
  /**
   * In one transaction: move the interactions, the oportunidades and the
   * contacts (skipping exact duplicates, keeping the destination's principal)
   * of `idOrigen` into `idDestino` and delete the origin. Returns the
   * destination. Throws `EmpresaNotFoundError` when either does not exist.
   */
  fusionar(idOrigen: string, idDestino: string): Promise<Empresa>;
  /** Sectors with their icon, alphabetical by name. */
  listSectores(): Promise<Sector[]>;
  /** Throws `SectorDuplicadoError` (case-insensitive). Returns the stored sector. */
  createSector(nombre: string, icono: IconoSector | null): Promise<Sector>;
}

export interface ICrmOportunidadRepository {
  getById(idOportunidad: string): Promise<Oportunidad | null>;
  /** All oportunidades of all empresas, newest first. */
  list(): Promise<Oportunidad[]>;
  /** Oportunidades of one empresa, newest first. Throws nothing for an unknown empresa (empty list). */
  listByEmpresa(idEmpresa: string): Promise<Oportunidad[]>;
  /** Throws `EmpresaNotFoundError` when the empresa does not exist. */
  create(idEmpresa: string, datos: NuevaOportunidad, migrada?: boolean): Promise<Oportunidad>;
  /**
   * Replace the editable data of the oportunidad. Throws `OportunidadNotFoundError`.
   */
  updateDatos(idOportunidad: string, datos: DatosOportunidad): Promise<Oportunidad>;
  /**
   * Write the whole follow-up state and, when given, a new activity in ONE
   * transaction (the activity links to this oportunidad). Throws
   * `OportunidadNotFoundError`.
   */
  updateSeguimiento(
    idOportunidad: string,
    seguimiento: SeguimientoOportunidad,
    interaccion: NuevaInteraccion | null,
  ): Promise<Oportunidad>;
}

/**
 * Port to the SIGLA production database (read-only): the date of the last
 * performed service per empresa RUC. Winning a deal or registering a call
 * never writes here — only real attention data answers it.
 */
export interface IAtencionesServicio {
  /** Last attention date of the RUC; NULL when SIGLA has none for it. */
  ultimaAtencion(ruc: string): Promise<string | null>;
  /**
   * Same lookup for many RUCs in bulk: one query per chunk (never one per
   * RUC). RUCs with no `Cliente` row in SIGLA, and clientes with no orders,
   * map to `null` — the same signal the single lookup gives (regla S6.7).
   */
  ultimaAtencionPorRucs(rucs: string[]): Promise<Map<string, string | null>>;
}

// ---------------------------------------------------------------------------
// Platform-configuration port (agente-ia-crm E5·T2, portado por
// crm-consulta-sunat) — CrmConfig key/value rows + their audit trail.
// Encryption is the CALLER's job (the port stores whatever string it is
// given); the adapter only guarantees that secret values never reach the
// audit trail. One SQL adapter implements it (SqlServerConfigRepository).
// ---------------------------------------------------------------------------

export interface GuardarConfigInput {
  clave: string;
  valor: string;
  esSecreto: boolean;
  usuario: string;
}

export interface EliminarConfigInput {
  clave: string;
  usuario: string;
}

export interface ListarAuditoriaConfigInput {
  /** Exact key filter; omit for the whole trail. */
  clave?: string;
  /** Newest-first cap (default 50, max 200). */
  limite?: number;
}

export interface ConfigCrmRepository {
  obtener(clave: string): Promise<EntradaConfigCrm | null>;
  /** Rows whose key starts with `prefijo` (literal match, wildcards escaped). */
  listar(prefijo: string): Promise<EntradaConfigCrm[]>;
  /** Upsert + audit row in ONE transaction. */
  guardar(input: GuardarConfigInput): Promise<void>;
  /** Delete + audit row in ONE transaction; no-op when the key is absent. */
  eliminar(input: EliminarConfigInput): Promise<void>;
  listarAuditoria(input?: ListarAuditoriaConfigInput): Promise<AuditoriaConfigCrm[]>;
}

// ---------------------------------------------------------------------------
// SUNAT lookup port (crm-consulta-sunat T4, S1). One adapter
// (ApiFacturacionCliente) talks to apifacturacion.com; tests replace it
// whole with a fake servicio.
// ---------------------------------------------------------------------------

/** SUNAT data of one RUC, ready for the UI autocomplete (S3). */
export interface IConsultaRucServicio {
  /** Throws `ConsultaNoConfiguradaError`, `RucNoEncontradoError` or `ServicioConsultaError`. */
  consultar(ruc: string): Promise<DatosSunat>;
}
