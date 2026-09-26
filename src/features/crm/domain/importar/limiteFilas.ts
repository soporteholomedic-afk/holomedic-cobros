/**
 * Import row cap (tasks pr6/WU3, design §4 "server re-validates
 * EVERYTHING; row cap 2000"). Lives in the DOMAIN layer so both the
 * infrastructure mapper (importadorCrm — the boundary that receives
 * client-parsed rows) and the application use case (defense in depth)
 * enforce the SAME limit with the SAME typed error. Extends
 * `ValidationError` so the pr8 routes map it to HTTP 400 for free.
 */
import { ValidationError } from '../errors';

export const MAXIMO_FILAS_IMPORTACION = 2000;

export class ImportacionExcedeLimiteError extends ValidationError {
  constructor(
    message = `El archivo supera el máximo de ${MAXIMO_FILAS_IMPORTACION} filas por importación`,
  ) {
    super(message);
    this.name = 'ImportacionExcedeLimiteError';
  }
}
