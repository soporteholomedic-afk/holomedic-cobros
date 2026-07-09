import { NextResponse } from 'next/server';

import { getAreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { ListTemplatesUseCase } from '@/features/plantillas-editor/application/listTemplates';
import { projectToSpitchDTO } from '@/features/plantillas-editor/application/projectToSpitchDTO';

// ---- Response types ----

interface SpitchesSuccess {
  spitches: ReturnType<typeof projectToSpitchDTO>[];
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = SpitchesSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

// ---- GET handler ----

/**
 * GET /api/plantillas/trash?area=
 *
 * Lists SOFT-DELETED templates for an area (the trash view) and projects
 * each to `SpitchDTO`. The adapter's `listDeletedByArea` enforces
 * `deletedAt IS NOT NULL`, so active templates cannot leak into the recovery
 * list. Unknown area → 400 `VALIDATION_ERROR "Unknown area"`.
 */
export async function GET(request: Request): Promise<NextResponse<GetResponse>> {
  try {
    const url = new URL(request.url);
    const area = url.searchParams.get('area');

    if (!area) {
      return buildError('VALIDATION_ERROR', '"area" query parameter is required', 400);
    }
    if (!getAreaConfig(area)) {
      return buildError('VALIDATION_ERROR', `Unknown area: ${area}`, 400);
    }

    const repo = await getTemplateDb();
    const useCase = new ListTemplatesUseCase(repo);
    const trashed = await useCase.listTrash(area);
    const spitches = trashed.map(projectToSpitchDTO);

    return NextResponse.json({ spitches });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas trash GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
