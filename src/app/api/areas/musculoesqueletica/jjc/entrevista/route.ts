import { NextResponse } from 'next/server';
import {
  buildSaveEntrevistaOsteomuscular,
  buildLoadEntrevistaOsteomuscular,
} from '@/features/entrevista-osteomuscular/composition/container';

/**
 * POST /api/areas/musculoesqueletica/jjc/entrevista
 *
 * Save (upsert) the osteomuscular interview of an attention, keyed by
 * idAtencion with area = 'musculoesqueletica'.
 *
 * Body: { idAtencion, entrevista }
 *
 * Statuses:
 * - 200: Saved (created or updated)
 * - 400: Validation error (typed JSON body)
 * - 500: Internal server error
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: Record<string, unknown> = await request.json();

    const idAtencion = typeof body.idAtencion === 'string' ? body.idAtencion : '';
    const entrevista = body.entrevista ?? null;

    const useCase = buildSaveEntrevistaOsteomuscular();
    const result = await useCase.execute({ idAtencion, entrevista });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, idAtencion: idAtencion.trim() }, { status: 200 });
  } catch (err) {
    console.warn('[api/musculoesqueletica/jjc/entrevista] POST error', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/areas/musculoesqueletica/jjc/entrevista?idAtencion=...
 *
 * Load the stored osteomuscular interview of an attention.
 *
 * Statuses:
 * - 200: Interview found
 * - 404: Not found (no interview saved for this idAtencion)
 * - 400: Missing idAtencion query param
 * - 500: Internal server error
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const idAtencion = searchParams.get('idAtencion')?.trim() ?? '';

    if (!idAtencion) {
      return NextResponse.json(
        { error: 'idAtencion query parameter is required' },
        { status: 400 },
      );
    }

    const useCase = buildLoadEntrevistaOsteomuscular();
    const result = await useCase.execute(idAtencion);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'Entrevista no encontrada', data: null },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (err) {
    console.warn('[api/musculoesqueletica/jjc/entrevista] GET error', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
