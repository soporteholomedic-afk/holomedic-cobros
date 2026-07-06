import { NextResponse } from 'next/server';

import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlite/betterSqliteTemplateRepository';
import { ListVersionsUseCase } from '@/features/plantillas-editor/application/listVersions';
import type { TemplateVersion } from '@/features/plantillas-editor/domain/entities';

// ---- Response types ----

interface VersionsSuccess {
  versions: TemplateVersion[];
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = VersionsSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- GET handler ----

/**
 * GET /api/plantillas/:id/versions
 *
 * Returns every version row for a template, ordered by `editedAt` DESC
 * (adapter contract; the rollback UI shows the most recent first). Missing
 * template → 404. Other errors → 500.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetResponse>> {
  try {
    const { id } = await ctx.params;
    const repo = await getTemplateDb();
    const useCase = new ListVersionsUseCase(repo);
    const versions = await useCase.execute(id);
    return NextResponse.json({ versions });
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas [id]/versions GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
