/**
 * Error surface for the SQL Server contact directory adapter.
 *
 * Mirrors the plantillas-editor `sqlServerTemplateRepository` pattern:
 * mssql errors carry a numeric `number` where 2601 (duplicate key row)
 * and 2627 (UNIQUE/PRIMARY KEY constraint violation) are the two
 * unique-index signals. The adapter maps them to
 * `ContactConflictError` so the API route can answer HTTP 409
 * `CONFLICT_ERROR` instead of leaking a raw DB error as 500
 * (design D5: the concurrent first-insert race is acceptable in this
 * single-operator flow; a retry wins the UPDATE branch).
 */

/**
 * Thrown by `SqlServerContactRepository.upsert` when the write hits a
 * SQL Server unique violation (2601/2627) — the signal that two
 * operators (or a retry racing an insert) tried to create the same
 * `ruc` row at the same time. The route maps this to HTTP 409.
 */
export class ContactConflictError extends Error {
  readonly code = 'CONFLICT_ERROR' as const;

  constructor(message = 'El contacto fue creado concurrentemente; reintentá la operación') {
    super(message);
    this.name = 'ContactConflictError';
  }
}

/**
 * Whether `err` is a SQL Server unique-index violation (2601/2627).
 * Narrowing is structural — mssql's RequestError exposes `number`, but
 * anything can land in a `catch`, so non-object / non-numeric shapes
 * are rejected instead of trusted.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'number' in err &&
    ((err as { number?: unknown }).number === 2601 ||
      (err as { number?: unknown }).number === 2627)
  );
}
