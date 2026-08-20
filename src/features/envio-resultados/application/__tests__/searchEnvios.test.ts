import { describe, expect, it, vi } from 'vitest';
import type { IEnvioHistoryRepository } from '../../domain/ports';
import type { EnvioSearchResult } from '../../domain/entities';
import { parseEnvioSearchQuery, SearchEnviosUseCase } from '../searchEnvios';

/**
 * Param-validation half of the history buscador read path (task 2.2):
 * `parseEnvioSearchQuery` is the pure rule set; `SearchEnviosUseCase`
 * short-circuits invalid params before the repository is touched and
 * propagates repository failures for the route to map to 500.
 */

const EMPTY_RESULT: EnvioSearchResult = { rows: [], total: 0, page: 1 };

function makeMockRepo(search = vi.fn().mockResolvedValue(EMPTY_RESULT)): IEnvioHistoryRepository {
  return {
    insert: vi.fn(),
    updateStatus: vi.fn(),
    search,
    getById: vi.fn(),
  } as unknown as IEnvioHistoryRepository;
}

describe('parseEnvioSearchQuery', () => {
  it('defaults to page 1 with no filters when everything is absent', () => {
    expect(parseEnvioSearchQuery({})).toEqual({ ok: true, query: { page: 1 } });
    expect(parseEnvioSearchQuery({ q: null, fechaInicio: null, page: null })).toEqual({
      ok: true,
      query: { page: 1 },
    });
  });

  it('trims q and drops whitespace-only values', () => {
    expect(parseEnvioSearchQuery({ q: '  peru contratas  ' })).toEqual({
      ok: true,
      query: { q: 'peru contratas', page: 1 },
    });
    expect(parseEnvioSearchQuery({ q: '   ', page: '2' })).toEqual({
      ok: true,
      query: { page: 2 },
    });
  });

  it('accepts YYYY-MM-DD dates and passes them through', () => {
    expect(
      parseEnvioSearchQuery({ fechaInicio: '2026-08-01', fechaFin: '2026-08-20', page: 3 }),
    ).toEqual({ ok: true, query: { fechaInicio: '2026-08-01', fechaFin: '2026-08-20', page: 3 } });
  });

  it('rejects malformed dates with the field named in the error', () => {
    expect(parseEnvioSearchQuery({ fechaInicio: '20/08/2026' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('fechaInicio'),
    });
    expect(parseEnvioSearchQuery({ fechaFin: '2026-8-20' })).toMatchObject({ ok: false });
  });

  it('rejects page values that are not integers ≥ 1', () => {
    for (const bad of ['0', '-1', 'abc', '2.5', ' ']) {
      expect(parseEnvioSearchQuery({ page: bad })).toMatchObject({ ok: false });
    }
    // Valid: numeric string AND already-parsed number both accepted.
    expect(parseEnvioSearchQuery({ page: '4' })).toEqual({ ok: true, query: { page: 4 } });
    expect(parseEnvioSearchQuery({ page: 4 })).toEqual({ ok: true, query: { page: 4 } });
  });
});

describe('SearchEnviosUseCase', () => {
  it('delegates the parsed query to the repository and returns its result', async () => {
    const result: EnvioSearchResult = { rows: [], total: 5, page: 2 };
    const search = vi.fn().mockResolvedValue(result);
    const useCase = new SearchEnviosUseCase(makeMockRepo(search));

    const outcome = await useCase.execute({ q: ' perú ', fechaInicio: '2026-08-01', page: '2' });

    expect(outcome).toEqual({ ok: true, result });
    expect(search).toHaveBeenCalledWith({
      q: 'perú',
      fechaInicio: '2026-08-01',
      page: 2,
    });
  });

  it('returns VALIDATION_ERROR without touching the repository', async () => {
    const search = vi.fn();
    const useCase = new SearchEnviosUseCase(makeMockRepo(search));

    const outcome = await useCase.execute({ page: '0' });

    expect(outcome).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(search).not.toHaveBeenCalled();
  });

  it('propagates repository failures (route maps them to 500)', async () => {
    const search = vi.fn().mockRejectedValue(new Error('connection lost'));
    const useCase = new SearchEnviosUseCase(makeMockRepo(search));

    await expect(useCase.execute({ page: 1 })).rejects.toThrow('connection lost');
  });
});
