/**
 * Typed error surface for the CRM application boundary (design §4:
 * plantillas-style typed codes — the pr4 API routes map `code` to HTTP
 * status: VALIDATION_ERROR → 400, CONFLICT_ERROR → 409, NOT_FOUND →
 * 404). Living in the DOMAIN layer so both the use cases (which raise
 * them) and the SQL Server adapter (which maps DB unique violations to
 * `ConflictError`) can reference them without an outward dependency.
 *
 * Messages are Spanish on purpose — they surface verbatim in the UI
 * through the API error body (repo convention).
 */

/** Business-rule violation in the input (e.g. contacto sin correo). */
export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Registry-conflict: the write collides with an existing row —
 * duplicated normalized RUC, duplicated contacto name within the same
 * empresa, duplicated correo, or a second principal (filtered index
 * backstop). The adapter raises it on SQL Server 2601/2627; the API
 * maps it to HTTP 409.
 */
export class ConflictError extends Error {
  readonly code = 'CONFLICT_ERROR' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** The requested empresa does not exist (API maps it to HTTP 404). */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND_ERROR' as const;

  constructor(message = 'Empresa no encontrada') {
    super(message);
    this.name = 'NotFoundError';
  }
}
