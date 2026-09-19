import { ConflictError } from '../../domain/errors';

/**
 * Map a SQL Server unique violation (2601 duplicate row / 2627
 * constraint) to the typed `ConflictError`, using the constraint/index
 * name embedded in the error message to pick a UI-ready Spanish
 * reason. Any other error passes through untouched. Shared by the
 * registry repository (pr3) and the import adapter (pr6).
 */
export function mapearConflictoUnico(err: unknown): unknown {
  if (typeof err !== 'object' || err === null || !('number' in err)) return err;
  const numero = (err as { number?: unknown }).number;
  if (numero !== 2601 && numero !== 2627) return err;

  const mensaje = err instanceof Error ? err.message : '';
  if (mensaje.includes('RucNormalizado')) {
    return new ConflictError('Ya existe una empresa con ese RUC');
  }
  if (mensaje.includes('EmpresaNombre')) {
    return new ConflictError('Ya existe un contacto con ese nombre en esta empresa');
  }
  if (mensaje.includes('ContactoCorreo')) {
    return new ConflictError('Ese correo ya está registrado para el contacto');
  }
  if (mensaje.includes('Principal')) {
    return new ConflictError('Solo puede haber un contacto principal por empresa');
  }
  return new ConflictError('La operación genera un conflicto de datos duplicados');
}
