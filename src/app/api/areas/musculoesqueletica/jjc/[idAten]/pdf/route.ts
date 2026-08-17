import { NextResponse } from 'next/server';
import { buildPdfService } from '@/features/musculoesqueletica-pdf/composition/container';
import {
  AtencionNotFoundError,
  DatasetNotFoundError,
  DataSourceUnavailableError,
  EdgeUnavailableError,
  PrintError,
} from '@/features/musculoesqueletica-pdf/domain/errors';

/**
 * GET /api/areas/musculoesqueletica/jjc/[idAten]/pdf
 *
 * Generates the single-document musculoesqueletica JJC PDF (entrevista +
 * evaluación) by rendering the offline page templates, printing each with
 * system Edge through puppeteer-core and merging the pages with pdf-lib.
 *
 * Status codes:
 * - 200: PDF with `application/pdf` and stable area-specific filename
 * - 400: Missing `idAten` path segment
 * - 404: Atencion or required dataset not found
 * - 502: Database source or Edge browser unavailable / print failure
 * - 500: Template, render, merge or unexpected failure (no partial PDF)
 *
 * Only the error code and idAten are ever logged — never clinical payloads.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ idAten: string }> },
): Promise<NextResponse> {
  const { idAten } = await params;
  const id = idAten?.trim();
  if (!id) {
    return NextResponse.json({ error: 'idAtencion_required' }, { status: 400 });
  }

  const service = buildPdfService();
  try {
    const bytes = await service.generate(id);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="musculoesqueletica-jjc-${id}.pdf"`,
      },
    });
  } catch (err) {
    const errorName = err instanceof Error ? err.name : 'unknown';
    console.warn('[api/musculoesqueletica/jjc/pdf] request failed', {
      idAten: id,
      error: errorName,
    });

    if (err instanceof AtencionNotFoundError) {
      return NextResponse.json({ error: 'atencion_not_found' }, { status: 404 });
    }
    if (err instanceof DatasetNotFoundError) {
      return NextResponse.json({ error: 'data_not_found' }, { status: 404 });
    }
    if (
      err instanceof DataSourceUnavailableError ||
      err instanceof EdgeUnavailableError ||
      err instanceof PrintError
    ) {
      return NextResponse.json(
        { error: err instanceof DataSourceUnavailableError ? 'database_unavailable' : 'edge_unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}