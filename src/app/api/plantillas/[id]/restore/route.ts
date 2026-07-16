import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';
import { RestoreTemplateUseCase } from '@/features/plantillas-editor/application/restoreTemplate';

// ---- Response types ----

interface RestoreSuccess {
  id: string;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type PostResponse = RestoreSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- POST handler ----

/**
 * POST /api/plantillas/:id/restore
 *
 * Clears `deletedAt` (restores a soft-deleted template). Does NOT re-default
 * — `isDefault` stays false because `softDelete` cleared it. Returns
 * `{ id }` with 200. Missing template → 404. Other errors → 500.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<PostResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const useCase = new RestoreTemplateUseCase(repo);
    await useCase.execute(id);
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id]/restore POST route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
