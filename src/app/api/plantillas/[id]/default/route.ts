import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';
import { SetDefaultTemplateUseCase } from '@/features/plantillas-editor/application/setDefaultTemplate';

// ---- Response types ----

interface DefaultSuccess {
  id: string;
  isDefault: boolean;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type PatchResponse = DefaultSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- PATCH handler ----

/**
 * PATCH /api/plantillas/:id/default
 *
 * Marks the template as the default for its `area+type`. The adapter runs
 * clear-then-set in ONE transaction: clears the previous default for the same
 * area+type (active rows only), then sets `isDefault=1` on the target — so
 * the partial unique index stays satisfied (at most one default per area+type
 * among active).
 *
 * Returns `{ id, isDefault }` with 200 (isDefault is always true — the route
 * reads back the post-state to confirm). Missing template → 404. Other
 * errors → 500.
 */
export async function PATCH(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<PatchResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const useCase = new SetDefaultTemplateUseCase(repo);
    await useCase.execute(id);
    // Read back the post-state so the response carries the confirmed flag.
    const tpl = await repo.getById(id);
    if (!tpl) {
      // Defensive — the row was just updated; if it vanished, surface as 500.
      return buildError('INTERNAL_ERROR', `post-set-default row missing for id=${id}`, 500);
    }
    return NextResponse.json({ id: tpl.id, isDefault: tpl.isDefault });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id]/default PATCH route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
