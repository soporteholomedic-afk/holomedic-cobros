import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlite/betterSqliteTemplateRepository';
import { RollbackTemplateUseCase } from '@/features/plantillas-editor/application/rollbackTemplate';

// ---- Response types ----

interface RollbackSuccess {
  id: string;
  currentVersionId: string | null;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type PostResponse = RollbackSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

/**
 * Type guard for the rollback body: `{ versionId: string }`.
 */
function isRollbackBody(v: unknown): v is { versionId: string } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.versionId === 'string';
}

// ---- POST handler ----

/**
 * POST /api/plantillas/:id/rollback
 *
 * Body: `{ versionId }`. Rolls the template back to the target version by
 * appending a NEW version row copying the target's content (append-only —
 * existing rows are never mutated or deleted). Returns
 * `{ id, currentVersionId }` with 200.
 *
 * Missing/malformed versionId → 400. Missing template or version → 404.
 * Other errors → 500.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<PostResponse>> {
  try {
    const { id } = await ctx.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('VALIDATION_ERROR', 'Request body must be valid JSON', 400);
    }
    if (!isRollbackBody(body)) {
      return buildError(
        'VALIDATION_ERROR',
        'Body must contain {versionId: string}',
        400,
      );
    }

    const repo = await getTemplateDb();
    const useCase = new RollbackTemplateUseCase(repo);
    const rolledBack = await useCase.execute(id, body.versionId);

    return NextResponse.json({ id: rolledBack.id, currentVersionId: rolledBack.currentVersionId });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id]/rollback POST route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
