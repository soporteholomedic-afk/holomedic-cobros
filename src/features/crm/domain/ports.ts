import type {
  AuditoriaConfigCrm,
  DatosEmpresa,
  Empresa,
  EntradaConfigCrm,
  EstadoEmpresa,
  IconoSector,
  Interaccion,
  NuevaEmpresa,
  NuevaInteraccion,
  Sector,
  SeguimientoEmpresa,
} from './entities';

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
  /** Write stage, medium and loss reason together. Throws `EmpresaNotFoundError`. */
  updateEstado(id: string, estado: EstadoEmpresa): Promise<Empresa>;
  /**
   * Write the whole follow-up state and, when given, a new interaction in ONE
   * transaction. Throws `EmpresaNotFoundError`.
   */
  updateSeguimiento(
    id: string,
    seguimiento: SeguimientoEmpresa,
    interaccion: NuevaInteraccion | null,
  ): Promise<Empresa>;
  addInteraccion(idEmpresa: string, interaccion: NuevaInteraccion): Promise<Interaccion>;
  /** Contact history of an empresa, newest first. */
  listInteracciones(idEmpresa: string): Promise<Interaccion[]>;
  /**
   * In one transaction: move the interactions and the contacts (skipping exact
   * duplicates, keeping the destination's principal) of `idOrigen` into
   * `idDestino` and delete the origin. Returns the destination.
   * Throws `EmpresaNotFoundError` when either does not exist.
   */
  fusionar(idOrigen: string, idDestino: string): Promise<Empresa>;
  /** Sectors with their icon, alphabetical by name. */
  listSectores(): Promise<Sector[]>;
  /** Throws `SectorDuplicadoError` (case-insensitive). Returns the stored sector. */
  createSector(nombre: string, icono: IconoSector | null): Promise<Sector>;
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
