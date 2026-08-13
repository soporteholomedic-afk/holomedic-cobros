/**
 * Thrown by the SQL Server template adapter's mutating operations
 * (`softDelete`, `restore`, `clone`, `setDefault`, `rollback`) when the
 * referenced template (or version) does not exist. `getById` returns
 * `null` instead (read contract). API routes catch this and map it to
 * HTTP 404.
 */
export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

/**
 * Thrown by `SqlServerTemplateRepository.save` when the write would
 * violate `idx_templates_default_area_type` — i.e. the operation tries
 * to create a second default for the same `(area, type)` without going
 * through the transactional clear-then-set dance. The adapter maps SQL
 * Server unique violations (2601/2627) to this error so the route can
 * answer HTTP 409 `CONFLICT_ERROR` instead of leaking a raw DB error
 * as 500.
 */
export class TemplateDefaultConflictError extends Error {
  readonly code = 'CONFLICT_ERROR' as const;

  constructor(message = 'Ya existe una plantilla por defecto para este tipo') {
    super(message);
    this.name = 'TemplateDefaultConflictError';
  }
}
