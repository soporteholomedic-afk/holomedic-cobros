import type { EmpresaContacto, SaveContactInput } from './entities';

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
