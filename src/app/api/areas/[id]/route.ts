import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAreaDb } from '@/features/areas/infrastructure/getAreaDb';
import { ActualizarAreaUseCase } from '@/features/areas/application/actualizarArea';
import { EliminarAreaUseCase } from '@/features/areas/application/eliminarArea';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

interface UpdateBody {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
}

function isUpdateBody(v: unknown): v is UpdateBody {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (obj.nombre !== undefined
    && (typeof obj.nombre !== 'string' || obj.nombre.trim().length === 0)) return false;
  if (obj.descripcion !== undefined && obj.descripcion !== null
    && typeof obj.descripcion !== 'string') return false;
  if (obj.activo !== undefined && typeof obj.activo !== 'boolean') return false;
  return true;
}

function mapAreaError(error: unknown): NextResponse<ErrorResponse> | null {
  if (error instanceof Error && error.name === 'AreaDuplicadaError') {
    return buildError(error.message, 409);
  }
  if (error instanceof Error && error.name === 'AreaNotFoundError') {
    return buildError('Área no encontrada', 404);
  }
  return null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }

    if (!isUpdateBody(body)) {
      return buildError('Cuerpo inválido', 400);
    }

    const input: UpdateBody = {};
    if (body.nombre !== undefined) input.nombre = body.nombre.trim();
    if (body.descripcion !== undefined) {
      input.descripcion = body.descripcion?.trim() ? body.descripcion.trim() : null;
    }
    if (body.activo !== undefined) input.activo = body.activo;

    const repo = await getAreaDb();
    const area = await new ActualizarAreaUseCase(repo).execute(id, input);

    return NextResponse.json({ success: true, area });
  } catch (error) {
    const mapped = mapAreaError(error);
    if (mapped) return mapped;
    console.error('PUT /api/areas/[id] failed:', error);
    return buildError('Error al actualizar el área', 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    const { id } = await params;

    const repo = await getAreaDb();
    await new EliminarAreaUseCase(repo).execute(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const mapped = mapAreaError(error);
    if (mapped) return mapped;
    console.error('DELETE /api/areas/[id] failed:', error);
    return buildError('Error al eliminar el área', 500);
  }
}
