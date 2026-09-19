import { NextResponse } from 'next/server';

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/features/crm/domain/errors';

/**
 * Typed error surface for the CRM API routes (design §4: plantillas-style
 * `buildError` codes mapped to HTTP statuses — VALIDATION_ERROR 400,
 * CONFLICT_ERROR 409, NOT_FOUND_ERROR 404, FORBIDDEN 403, plus
 * UNAUTHORIZED 401 for the missing-session case the design list leaves
 * implicit in the G7 scenarios). Domain errors carry their own `code`, so
 * the mapping passes it through verbatim — a single source of truth.
 *
 * `INTERNAL_ERROR` never echoes the raw error message (valoraciones
 * precedent: user-safe Spanish message, details only in the server log).
 */

export type CrmErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'INTERNAL_ERROR';

export interface CrmErrorResponse {
  success: false;
  error: string;
  code: CrmErrorCode;
}

export function buildCrmError(
  code: CrmErrorCode,
  error: string,
  status: number,
): NextResponse<CrmErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

/**
 * Map a thrown value to the typed HTTP error response. `scope` labels the
 * server-side log line (e.g. "crm empresas POST").
 */
export function mapCrmError(scope: string, error: unknown): NextResponse<CrmErrorResponse> {
  if (error instanceof ValidationError) {
    return buildCrmError('VALIDATION_ERROR', error.message, 400);
  }
  if (error instanceof ConflictError) {
    return buildCrmError('CONFLICT_ERROR', error.message, 409);
  }
  if (error instanceof NotFoundError) {
    return buildCrmError('NOT_FOUND_ERROR', error.message, 404);
  }
  console.error(`${scope} route error:`, error);
  return buildCrmError('INTERNAL_ERROR', 'Error interno del servidor. Intente nuevamente.', 500);
}
