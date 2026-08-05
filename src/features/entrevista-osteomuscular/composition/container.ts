import { SqlServerEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/infrastructure/sqlserver/EntrevistaOsteomuscularRepository';
import { SaveEntrevistaOsteomuscularUseCase } from '@/features/entrevista-osteomuscular/application/saveEntrevistaOsteomuscular';
import { LoadEntrevistaOsteomuscularUseCase } from '@/features/entrevista-osteomuscular/application/loadEntrevistaOsteomuscular';

/**
 * Composition root for the osteomuscular interview feature.
 * This is the ONLY place where concrete adapter types are bound to ports.
 */
export function buildSaveEntrevistaOsteomuscular(): SaveEntrevistaOsteomuscularUseCase {
  const repo = new SqlServerEntrevistaOsteomuscularRepository();
  return new SaveEntrevistaOsteomuscularUseCase(repo);
}

export function buildLoadEntrevistaOsteomuscular(): LoadEntrevistaOsteomuscularUseCase {
  const repo = new SqlServerEntrevistaOsteomuscularRepository();
  return new LoadEntrevistaOsteomuscularUseCase(repo);
}
