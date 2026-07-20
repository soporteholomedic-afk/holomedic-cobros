import { NextResponse } from 'next/server';
import { buildSaveJjcEvaluacion, buildLoadJjcEvaluacion } from '@/features/jjc-mapper/composition/container';
import type { Fototipo } from '@/types/jjc';

/**
 * POST /api/areas/medicina/jjc/evaluaciones
 *
 * Save (upsert) a JJC evaluation.
 *
 * Body: { idAtencion, fechaEvaluacion, fototipo, observaciones?, lesiones? }
 *
 * Statuses:
 * - 201: Created (new evaluation)
 * - 200: Updated (existing evaluation overwritten)
 * - 400: Validation error (typed JSON body)
 * - 500: Internal server error
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: Record<string, unknown> = await request.json();

    const idAtencion = typeof body.idAtencion === 'string' ? body.idAtencion : '';
    const fechaEvaluacion = typeof body.fechaEvaluacion === 'string' ? body.fechaEvaluacion : '';
    const fototipo = typeof body.fototipo === 'string' ? (body.fototipo as Fototipo) : undefined;
    const observaciones = typeof body.observaciones === 'string' ? body.observaciones : '';
    const lesiones = Array.isArray(body.lesiones) ? body.lesiones : [];

    const useCase = buildSaveJjcEvaluacion();
    const result = await useCase.execute({
      idAtencion,
      fechaEvaluacion,
      fototipo: fototipo as Fototipo,
      observaciones,
      lesiones,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: idAtencion }, { status: 201 });
  } catch (err) {
    console.warn('[api/jjc/evaluaciones] POST error', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/areas/medicina/jjc/evaluaciones?idAtencion=...
 *
 * Load a JJC evaluation by attention ID.
 *
 * Statuses:
 * - 200: Evaluation found
 * - 404: Not found (no evaluation for this idAtencion)
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

    const useCase = buildLoadJjcEvaluacion();
    const result = await useCase.execute(idAtencion);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'Evaluación no encontrada', data: null },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (err) {
    console.warn('[api/jjc/evaluaciones] GET error', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
