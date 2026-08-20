import { NextResponse } from 'next/server';
import { SearchEnviosUseCase } from '@/features/envio-resultados/application/searchEnvios';
import { getEnvioHistoryDb } from '@/features/envio-resultados/infrastructure/getEnvioHistoryDb';
import { ENVIO_HISTORY_PAGE_SIZE } from '@/features/envio-resultados/infrastructure/sqlserver/SqlServerEnvioHistoryRepository';

/**
 * GET /api/consolidados/envios — server-side paged search over the
 * consolidated-send history (PR2 read path). Params (validation owned
 * by `SearchEnviosUseCase`): `q?` (accent-insensitive OR across the 4
 * precomputed search columns), `fechaInicio`/`fechaFin` (`YYYY-MM-DD`,
 * inclusive), `page` (int ≥ 1, default 1).
 *
 * 200 `{success, rows, total, page, pageSize}` (summaries, no bodyHtml)
 * · 400 `VALIDATION_ERROR` · 500 `INTERNAL_ERROR` — send-results
 * conventions. Protected via `RUTAS_PROTEGIDAS` (permiso `consolidados`).
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
