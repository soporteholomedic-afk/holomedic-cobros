import { NextResponse } from 'next/server';
import { getEnvioHistoryDb } from '@/features/envio-resultados/infrastructure/getEnvioHistoryDb';

/**
 * GET /api/consolidados/envios/[id] — full history row by PK (PR2).
 * The reenvío hydration endpoint: the ONLY read path returning
 * `bodyHtml` (PK seek, no scan); PR4's `?reenvio=<id>` flow consumes
 * it. 200 `{success, row}` · 404 `NOT_FOUND` · 500 `INTERNAL_ERROR`.
 * Protected via the `/api/consolidados/envios` `RUTAS_PROTEGIDAS` entry
 * (`startsWith` covers this subpath).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const repo = await getEnvioHistoryDb();
    const row = await repo.getById(id);
    if (!row) {
      return NextResponse.json(
        { success: false, error: `No envío found with id "${id}"`, code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, row });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('consolidados envios [id] route error:', error);
    return NextResponse.json({ success: false, error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
