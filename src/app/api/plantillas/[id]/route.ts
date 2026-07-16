import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';
import { SoftDeleteTemplateUseCase } from '@/features/plantillas-editor/application/softDeleteTemplate';
import type { Template } from '@/features/plantillas-editor/domain/entities';

// ---- Response types ----

interface TemplateSuccess {
  template: Template;
}

interface DeleteSuccess {
  id: string;
  deletedAt: string | null;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = TemplateSuccess | ErrorResponse;
type DeleteResponse = DeleteSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- GET handler ----

/**
 * GET /api/plantillas/:id
 *
 * Returns the FULL template (the editor needs every authoring field:
 * `isDefault`, `currentVersionId`, `deletedAt`, timestamps). This is NOT
 * the `SpitchDTO` projection — the send flow uses `GET /api/plantillas`,
 * not this route. `getById` reads even soft-deleted rows so the trash
 * view can fetch a template for clone/restore preview.
 *
 * Missing id → 404. Other errors → 500.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const tpl = await repo.getById(id);
    if (!tpl) {
      return buildError('VALIDATION_ERROR', `Template not found: ${id}`, 404);
    }
    return NextResponse.json({ template: tpl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id] GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}

// ---- DELETE handler ----

/**
 * DELETE /api/plantillas/:id (soft delete)
 *
 * Sets `deletedAt=now` (and clears `isDefault` if the template was the
 * default). Returns `{ id, deletedAt }` with 200. Missing id → 404. The
 * template is recoverable via `POST /api/plantillas/:id/restore`.
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<DeleteResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const useCase = new SoftDeleteTemplateUseCase(repo);
    await useCase.execute(id);
    // Read back the post-state so the response carries the fresh deletedAt.
    const trashed = await repo.getById(id);
    if (!trashed) {
      // Defensive — the row was just updated; if it vanished, surface as 500.
      return buildError('INTERNAL_ERROR', `post-delete row missing for id=${id}`, 500);
    }
    return NextResponse.json({ id: trashed.id, deletedAt: trashed.deletedAt });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id] DELETE route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
