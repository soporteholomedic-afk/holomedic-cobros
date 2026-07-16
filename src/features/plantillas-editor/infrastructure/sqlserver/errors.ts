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
