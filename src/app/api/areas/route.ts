import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAreaDb } from '@/features/areas/infrastructure/getAreaDb';
import { ListarAreasUseCase } from '@/features/areas/application/listarAreas';
import { CrearAreaUseCase } from '@/features/areas/application/crearArea';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function isCreateBody(v: unknown): v is { nombre: string; descripcion?: string | null } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.nombre !== 'string' || obj.nombre.trim().length === 0) return false;
  if (obj.descripcion !== undefined && obj.descripcion !== null
    && typeof obj.descripcion !== 'string') return false;
  return true;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    const repo = await getAreaDb();
    const areas = await new ListarAreasUseCase(repo).execute();

    return NextResponse.json({ success: true, areas });
  } catch (error) {
    console.error('GET /api/areas failed:', error);
    return buildError('Error al listar áreas', 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return buildError('El cuerpo debe ser JSON válido', 400);
    }

    if (!isCreateBody(body)) {
      return buildError('Cuerpo inválido: se requiere "nombre" no vacío', 400);
    }

    const repo = await getAreaDb();
    const area = await new CrearAreaUseCase(repo).execute({
      nombre: body.nombre.trim(),
      descripcion: body.descripcion?.trim() ? body.descripcion.trim() : null,
    });

    return NextResponse.json({ success: true, area }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'AreaDuplicadaError') {
      return buildError(error.message, 409);
    }
    console.error('POST /api/areas failed:', error);
    return buildError('Error al crear el área', 500);
  }
}
