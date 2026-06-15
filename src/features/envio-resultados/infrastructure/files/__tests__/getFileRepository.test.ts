import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setFileRepositoryForTests,
  getFileRepository,
} from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

afterEach(() => {
  // Always clear the test seam so a leaked mock does not poison the
  // next suite.
  __setFileRepositoryForTests(null);
});

function makeMockRepo(): IFileRepository {
  return {
    listFolder: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

describe('getFileRepository', () => {
  beforeEach(() => {
    __setFileRepositoryForTests(null);
  });

  it('returns the same instance on subsequent calls (caching)', () => {
    const a = getFileRepository();
    const b = getFileRepository();
    expect(a).toBe(b);
  });

  it('uses the injected mock after __setFileRepositoryForTests', () => {
    const mock = makeMockRepo();
    __setFileRepositoryForTests(mock);
    expect(getFileRepository()).toBe(mock);
  });

  it('the swap is observable on the very next call (no caching across swap)', () => {
    const first = makeMockRepo();
    const second = makeMockRepo();
    __setFileRepositoryForTests(first);
    expect(getFileRepository()).toBe(first);
    __setFileRepositoryForTests(second);
    expect(getFileRepository()).toBe(second);
  });

  it('after clearing the seam, the factory produces a fresh production instance', () => {
    const mock = makeMockRepo();
    __setFileRepositoryForTests(mock);
    expect(getFileRepository()).toBe(mock);
    __setFileRepositoryForTests(null);
    // After clearing, a new instance is created (different from the mock).
    const fresh = getFileRepository();
    expect(fresh).not.toBe(mock);
  });
});
