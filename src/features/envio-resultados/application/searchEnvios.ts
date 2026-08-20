import { DATE_PATTERN } from '@/lib/dates';
import type { IEnvioHistoryRepository } from '../domain/ports';
import type { EnvioSearchQuery, EnvioSearchResult } from '../domain/entities';

/**
 * Use case for the consolidated-send history buscador (PR2 read path).
 * Owns ALL query-param validation; the API route stays a thin
 * URL → use-case → JSON adapter. `q` is trimmed (whitespace-only =
 * absent); `fechaInicio`/`fechaFin` must be `YYYY-MM-DD`
 * (`DATE_PATTERN` from `src/lib/dates.ts`); `page` an integer ≥ 1
 * (default 1, accepts the raw URL string or a parsed number).
 */

/** Raw input straight from the URL search params (all optional/nullable). */
export interface SearchEnviosInput {
  q?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  page?: string | number | null;
}

export type SearchEnviosOutcome =
  | { ok: true; result: EnvioSearchResult }
  | { ok: false; code: 'VALIDATION_ERROR'; error: string };

/**
 * Pure validation half — returns the repository-shaped query or a
 * human-readable validation error. Exported for focused testing.
 */
export function parseEnvioSearchQuery(
  input: SearchEnviosInput,
): { ok: true; query: EnvioSearchQuery } | { ok: false; error: string } {
  const query: EnvioSearchQuery = { page: 1 };

  const q = input.q?.trim();
  if (q) query.q = q;

  for (const field of ['fechaInicio', 'fechaFin'] as const) {
    const value = input[field]?.trim();
    if (!value) continue;
    if (!DATE_PATTERN.test(value)) {
      return { ok: false, error: `"${field}" must be a YYYY-MM-DD date, got "${value}"` };
    }
    query[field] = value;
  }

  if (input.page !== undefined && input.page !== null && input.page !== '') {
    const pageText = String(input.page).trim();
    if (!/^\d+$/.test(pageText) || Number(pageText) < 1) {
      return { ok: false, error: `"page" must be an integer ≥ 1, got "${pageText}"` };
    }
    query.page = Number(pageText);
  }

  return { ok: true, query };
}

export class SearchEnviosUseCase {
  constructor(private readonly historyRepo: IEnvioHistoryRepository) {}

  /**
   * Validate the params, then delegate to the repository. Repository
   * failures PROPAGATE — the route's catch-all maps them to 500
   * `INTERNAL_ERROR` (a read path must fail loudly, unlike the
   * best-effort write path).
   */
  async execute(input: SearchEnviosInput): Promise<SearchEnviosOutcome> {
    const parsed = parseEnvioSearchQuery(input);
    if (!parsed.ok) return { ok: false, code: 'VALIDATION_ERROR', error: parsed.error };
    return { ok: true, result: await this.historyRepo.search(parsed.query) };
  }
}
