import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlite/betterSqliteTemplateRepository';
import { CloneTemplateUseCase } from '@/features/plantillas-editor/application/cloneTemplate';

// ---- Response types ----

interface CloneSuccess {
  id: string;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type PostResponse = CloneSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- POST handler ----

/**
 * POST /api/plantillas/:id/clone
 *
 * Clones the source template into a NEW active, non-default template with
 * a fresh id, copying `subject`/`bodyHtml`. Works on active OR soft-deleted
 * sources (the adapter reads even soft-deleted rows via `getById`).
 *
 * Returns `{ id }` with 201. Missing source → 404. Other errors → 500.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<PostResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const useCase = new CloneTemplateUseCase(repo);
    const cloned = await useCase.execute(id);
    return NextResponse.json({ id: cloned.id }, { status: 201 });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id]/clone POST route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
