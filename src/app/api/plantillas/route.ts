import { NextResponse } from 'next/server';

import { SPITCH_TYPES, type SpitchType, type SaveTemplateInput } from '@/features/plantillas-editor/domain/entities';
import { getAreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import { getTemplateDb } from '@/features/plantillas-editor/infrastructure/getTemplateDb';
import { TemplateNotFoundError } from '@/features/plantillas-editor/infrastructure/sqlserver';
import { ListTemplatesUseCase } from '@/features/plantillas-editor/application/listTemplates';
import { SaveTemplateUseCase } from '@/features/plantillas-editor/application/saveTemplate';
import { projectToSpitchDTO } from '@/features/plantillas-editor/application/projectToSpitchDTO';

// ---- Response types ----

interface SpitchesSuccess {
  spitches: ReturnType<typeof projectToSpitchDTO>[];
}

interface SaveSuccess {
  id: string;
  currentVersionId: string | null;
}

type ErrorCode = 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

interface ErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
}

type GetResponse = SpitchesSuccess | ErrorResponse;
type PostResponse = SaveSuccess | ErrorResponse;

// ---- Helpers ----

function buildError(code: ErrorCode, error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

function isSpitchType(v: unknown): v is SpitchType {
  return typeof v === 'string' && (SPITCH_TYPES as readonly string[]).includes(v);
}

/**
 * Type guard for the POST body. The route's role is to reject malformed
 * payloads before they reach the use case. `id` and `isDefault` are
 * optional; everything else is a required string.
 */
function isSaveBody(v: unknown): v is {
  area: string;
  type: string;
  name: string;
  subject: string;
  bodyHtml: string;
  id?: string;
  isDefault?: boolean;
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.area === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.subject === 'string' &&
    typeof obj.bodyHtml === 'string' &&
    (obj.id === undefined || typeof obj.id === 'string') &&
    (obj.isDefault === undefined || typeof obj.isDefault === 'boolean')
  );
}

// ---- GET handler ----

/**
 * GET /api/plantillas?area=&type=
 *
 * Lists ACTIVE templates for an area (optionally filtered by type) and
 * projects each to `SpitchDTO` (the send-flow boundary shape — no
 * authoring fields). Unknown area → 400 `VALIDATION_ERROR "Unknown area"`.
 */
export async function GET(request: Request): Promise<NextResponse<GetResponse>> {
  try {
    const url = new URL(request.url);
    const area = url.searchParams.get('area');
    const typeRaw = url.searchParams.get('type');

    if (!area) {
      return buildError('VALIDATION_ERROR', '"area" query parameter is required', 400);
    }
    if (!getAreaConfig(area)) {
      return buildError('VALIDATION_ERROR', `Unknown area: ${area}`, 400);
    }

    let type: SpitchType | undefined;
    if (typeRaw !== null) {
      if (!isSpitchType(typeRaw)) {
        return buildError(
          'VALIDATION_ERROR',
          `"type" must be one of: ${SPITCH_TYPES.join(', ')}`,
          400,
        );
      }
      type = typeRaw;
    }

    const repo = await getTemplateDb();
    const useCase = new ListTemplatesUseCase(repo);
    const templates = await useCase.listActive(area, type);
    const spitches = templates.map(projectToSpitchDTO);

    return NextResponse.json({ spitches });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas GET route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}

// ---- POST handler ----

/**
 * POST /api/plantillas
 *
 * Saves (creates OR updates) a template. The body shape:
 *   { area, type, name, id?, subject, bodyHtml, isDefault? }
 *
 * On success returns `{ id, currentVersionId }` with HTTP 201. Unknown
 * area / invalid type / missing fields → 400 `VALIDATION_ERROR`.
 * `TemplateNotFoundError` (updating a missing id) → 404. Other repo errors → 500.
 */
export async function POST(request: Request): Promise<NextResponse<PostResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('VALIDATION_ERROR', 'Request body must be valid JSON', 400);
    }
    if (!isSaveBody(body)) {
      return buildError(
        'VALIDATION_ERROR',
        'Body must contain {area, type, name, subject, bodyHtml} as strings',
        400,
      );
    }

    if (!getAreaConfig(body.area)) {
      return buildError('VALIDATION_ERROR', `Unknown area: ${body.area}`, 400);
    }
    if (!isSpitchType(body.type)) {
      return buildError(
        'VALIDATION_ERROR',
        `"type" must be one of: ${SPITCH_TYPES.join(', ')}`,
        400,
      );
    }
    if (!body.name.trim()) {
      return buildError('VALIDATION_ERROR', '"name" is required', 400);
    }
    if (!body.subject.trim()) {
      return buildError('VALIDATION_ERROR', '"subject" is required', 400);
    }
    if (!body.bodyHtml.trim()) {
      return buildError('VALIDATION_ERROR', '"bodyHtml" is required', 400);
    }

    const input: SaveTemplateInput = {
      area: body.area,
      type: body.type,
      name: body.name,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      ...(body.id !== undefined ? { id: body.id } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
    };

    const repo = await getTemplateDb();
    const useCase = new SaveTemplateUseCase(repo);
    const saved = await useCase.execute(input);

    return NextResponse.json(
      { id: saved.id, currentVersionId: saved.currentVersionId },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof TemplateNotFoundError) {
      return buildError('VALIDATION_ERROR', error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('plantillas POST route error:', error);
    return buildError('INTERNAL_ERROR', message, 500);
  }
}
