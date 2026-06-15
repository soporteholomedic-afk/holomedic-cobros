import type { IFileRepository } from '@/features/envio-resultados/domain/ports';
import { UncFileRepository } from './UncFileRepository';

let cached: IFileRepository | null = null;

/**
 * Return the process-wide file repository instance. The first call
 * creates a `UncFileRepository` against `FILE_SERVER_BASE_PATH`; every
 * subsequent call returns the same singleton so the underlying adapter
 * is reused across requests.
 */
export function getFileRepository(): IFileRepository {
  if (cached) return cached;
  cached = new UncFileRepository();
  return cached;
}

/**
 * Test seam — replaces (or clears) the cached repository so unit tests
 * for the API routes can inject a mock `IFileRepository` without ever
 * touching a real UNC share.
 */
export function __setFileRepositoryForTests(repo: IFileRepository | null): void {
  cached = repo;
}
