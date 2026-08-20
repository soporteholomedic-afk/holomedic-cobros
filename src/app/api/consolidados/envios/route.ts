import { NextResponse } from 'next/server';
import { SearchEnviosUseCase } from '@/features/envio-resultados/application/searchEnvios';
import { getEnvioHistoryDb } from '@/features/envio-resultados/infrastructure/getEnvioHistoryDb';
import { ENVIO_HISTORY_PAGE_SIZE } from '@/features/envio-resultados/infrastructure/sqlserver/SqlServerEnvioHistoryRepository';

/**
 * GET /api/consolidados/envios — server-side paged search over the
 * consolidated-send history (historial-envios-consolidados PR2).
 *
 * Query params (validation owned by `SearchEnviosUseCase`):
 * - `q`           — optional free text; OR'd across the precomputed
 *                   accent-stripped search columns (recipients,
 *                   company, subject, patients).
 * - `fechaInicio` / `fechaFin` — optional `YYYY-MM-DD`; inclusive range.
 * - `page`        — optional integer ≥ 1 (default 1).
 *
 * Responses (send-results conventions):
 * - 200 `{ success: true, rows, total, page, pageSize }` — `rows` are
 *   summaries WITHOUT `bodyHtml` (off-row LOB, PK-seek only).
 * - 400 `{ success: false, error, code: 'VALIDATION_ERROR' }`
 * - 500 `{ success: false, error, code: 'INTERNAL_ERROR' }`
 *
 * Protected by the proxy via `RUTAS_PROTEGIDAS` (permiso
 * `consolidados`) — see `src/features/auth/domain/routes.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const params = new URL(request.url).searchParams;
    const repo = await getEnvioHistoryDb();
    const outcome = await new SearchEnviosUseCase(repo).execute({
      q: params.get('q'),
      fechaInicio: params.get('fechaInicio'),
      fechaFin: params.get('fechaFin'),
      page: params.get('page'),
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { success: false, error: outcome.error, code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    return NextResponse.json({
      success: true,
      rows: outcome.result.rows,
      total: outcome.result.total,
      page: outcome.result.page,
      pageSize: ENVIO_HISTORY_PAGE_SIZE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('consolidados envios search route error:', error);
    return NextResponse.json({ success: false, error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
