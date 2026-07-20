import { SqlServerAtencionRepository } from '@/features/jjc-mapper/infrastructure/sqlserver/AtencionRepository';
import { GetAtencionDetalleUseCase } from '@/features/jjc-mapper/application/getAtencionDetalle';

/**
 * Composition root for the JJC face-lesion-mapper feature.
 *
 * Every public factory creates a use case wired to its production adapter.
 * This is the ONLY place where concrete adapter types are bound to ports.
 */
export function buildGetAtencionDetalle(): GetAtencionDetalleUseCase {
  const repo = new SqlServerAtencionRepository();
  return new GetAtencionDetalleUseCase(repo);
}
