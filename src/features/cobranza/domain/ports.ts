import type {
  CobranzaEnvioHistorial,
  EmpresaContacto,
  RegistroEnvioCobranzaInput,
  SaveContactInput,
} from './entities';

/**
 * Hexagonal port for the cobranza contact directory persistence
 * (REQ-01-DIR-01).
 *
 * Implementations:
 *  - `SqlServerContactRepository` — primary adapter, backed by the
 *    `dbo.EmpresaContactos` table in the `HOLOMEDIC` database on SQL
 *    Server (created idempotently by `migrate()`).
 *
 * Semantics enforced by the adapter:
 *  - `getByRuc` resolves the stored pair for a key or `null` when the
 *    directory has no record (the modal's empty-prefill state).
 *  - `upsert` is idempotent: an `UPDATE … WHERE ruc = @ruc; IF
 *    @@ROWCOUNT = 0 INSERT …` single batch keeps exactly one row per
 *    key carrying the latest emails, `updatedAt` (stamped app-side as
 *    an ISO string) and `updatedBy`. A concurrent first-insert race
 *    surfaces as `ContactConflictError` (SQL Server 2601/2627) so the
 *    route can answer 409.
 */
export interface ICompanyContactRepository {
  /** The stored contact pair for a RUC/DNI key, or null if unknown. */
  getByRuc(ruc: string): Promise<EmpresaContacto | null>;
  /** Idempotent insert-or-update; resolves the persisted contact. */
  upsert(input: SaveContactInput): Promise<EmpresaContacto>;
}

/**
 * Runtime registry of the port's operations. Single source of truth
 * for the method set — used by mock factories and adapter self-checks
 * so a renamed/missing method is caught at runtime, not just at
 * compile time (plantillas-editor precedent).
 */
export const COMPANY_CONTACT_REPOSITORY_METHODS = ['getByRuc', 'upsert'] as const;

/**
 * Hexagonal port for the cobranza send-attempt audit log (REQ-02).
 *
 * Implementations:
 *  - `SqlServerCobranzaHistorialRepository` — primary adapter, backed
 *    by the append-only `dbo.CobranzaEnviosHistorial` table in the
 *    `HOLOMEDIC` database (created idempotently by `migrate()`).
 *
 * Semantics enforced by the adapter:
 *  - `insert` appends exactly one immutable audit row per send
 *    attempt. `fechaEnvio` is stamped by the DB
 *    (`DEFAULT SYSUTCDATETIME()`, R7) and `id` by IDENTITY — neither
 *    travels in the input. Application code MUST NOT update or delete
 *    audit rows (no such method exists on the port by design).
 *  - `getByRuc` resolves the client's attempts most-recent-first
 *    (`ORDER BY fechaEnvio DESC`) WITHOUT the LOB `cuerpoResumen`
 *    column — the read model stays light and the email body is never
 *    re-rendered. An unknown key resolves to `[]`, not an error (no
 *    server-side client master exists to 404 against).
 */
export interface ICobranzaEnviosHistorialRepository {
  /** Append one immutable audit row for a send attempt. */
  insert(input: RegistroEnvioCobranzaInput): Promise<void>;
  /** The client's attempts, most-recent-first, without the email body. */
  getByRuc(ruc: string): Promise<CobranzaEnvioHistorial[]>;
}

/**
 * Runtime registry of the historial port's operations. Single source
 * of truth for the method set — used by mock factories and adapter
 * self-checks so a renamed/missing method is caught at runtime, not
 * just at compile time (COMPANY_CONTACT_REPOSITORY_METHODS precedent).
 */
export const COBRANZA_HISTORIAL_REPOSITORY_METHODS = ['insert', 'getByRuc'] as const;
