import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { UsuarioNotFoundError } from '@/features/auth/infrastructure/sqlserver';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('firma');

    if (!file || !(file instanceof Blob)) {
      return buildError('Archivo "firma" requerido', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const repo = await getUsuarioDb();
    await repo.updateFirma(id, buffer);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UsuarioNotFoundError) {
      return buildError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('firma POST error:', error);
    return buildError(message, 500);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return buildError('No autorizado', 401);
    }

    const { id } = await params;
    const repo = await getUsuarioDb();
    const firma = await repo.getFirma(id);

    if (!firma) {
      return buildError('Sin firma', 404);
    }

    return new NextResponse(new Uint8Array(firma), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': firma.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof UsuarioNotFoundError) {
      return buildError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('firma GET error:', error);
    return buildError(message, 500);
  }
}
