import { SqlServerAtencionRepository } from '@/features/jjc-mapper/infrastructure/sqlserver/AtencionRepository';
import { SqlServerJjcEvaluacionRepository } from '@/features/jjc-mapper/infrastructure/sqlserver/JjcEvaluacionRepository';
import { GetAtencionDetalleUseCase } from '@/features/jjc-mapper/application/getAtencionDetalle';
import { SaveJjcEvaluacionUseCase } from '@/features/jjc-mapper/application/saveJjcEvaluacion';
import { LoadJjcEvaluacionUseCase } from '@/features/jjc-mapper/application/loadJjcEvaluacion';

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

export function buildSaveJjcEvaluacion(): SaveJjcEvaluacionUseCase {
  const repo = new SqlServerJjcEvaluacionRepository();
  return new SaveJjcEvaluacionUseCase(repo);
}

export function buildLoadJjcEvaluacion(): LoadJjcEvaluacionUseCase {
  const repo = new SqlServerJjcEvaluacionRepository();
  return new LoadJjcEvaluacionUseCase(repo);
}
