import { SqlServerEvaluacionOsteomuscularRepository } from '@/features/evaluacion-osteomuscular/infrastructure/sqlserver/SqlServerEvaluacionOsteomuscularRepository';
import { SaveEvaluacionOsteomuscularUseCase } from '@/features/evaluacion-osteomuscular/application/saveEvaluacionOsteomuscular';
import { LoadEvaluacionOsteomuscularUseCase } from '@/features/evaluacion-osteomuscular/application/loadEvaluacionOsteomuscular';

/**
 * Composition root for the osteomuscular clinical evaluation feature.
 * This is the ONLY place where concrete adapter types are bound to ports.
 */
export function buildSaveEvaluacionOsteomuscular(): SaveEvaluacionOsteomuscularUseCase {
  const repo = new SqlServerEvaluacionOsteomuscularRepository();
  return new SaveEvaluacionOsteomuscularUseCase(repo);
}

export function buildLoadEvaluacionOsteomuscular(): LoadEvaluacionOsteomuscularUseCase {
  const repo = new SqlServerEvaluacionOsteomuscularRepository();
  return new LoadEvaluacionOsteomuscularUseCase(repo);
}
