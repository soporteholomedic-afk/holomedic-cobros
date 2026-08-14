import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, signJwt, COOKIE_NAME, getAuthCookieOptions } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import type { Permiso } from '@/features/auth/domain/entities';
import { PERMISOS } from '@/features/auth/domain/entities';
import { UpdateUsuarioUseCase } from '@/features/auth/application/actualizarUsuario';
import { DeleteUsuarioUseCase } from '@/features/auth/application/eliminarUsuario';
import { UsuarioNotFoundError } from '@/features/auth/infrastructure/sqlserver';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function isUpdateBody(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function validatePermisos(permisos: unknown): permisos is Permiso[] {
  return Array.isArray(permisos) && permisos.every(
    (p) => typeof p === 'string' && (PERMISOS as readonly string[]).includes(p),
  );
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

    const input: Record<string, unknown> = {};
    if (body.nombre !== undefined) {
      if (typeof body.nombre !== 'string' || body.nombre.trim().length === 0) {
        return buildError('"nombre" inválido', 400);
      }
      input.nombre = body.nombre.trim();
    }
    if (body.area !== undefined) {
      if (typeof body.area !== 'string' || body.area.trim().length === 0) {
        return buildError('"area" inválida', 400);
      }
      input.area = body.area.trim();
    }
    if (body.permisos !== undefined) {
      if (!validatePermisos(body.permisos)) {
        return buildError('"permisos" inválidos', 400);
      }
      input.permisos = body.permisos;
    }
    if (body.contrasena !== undefined) {
      if (typeof body.contrasena !== 'string' || body.contrasena.length < 4) {
        return buildError('"contrasena" debe tener al menos 4 caracteres', 400);
      }
      input.contrasena = body.contrasena;
    }
    if (body.activo !== undefined) {
      if (typeof body.activo !== 'boolean') {
        return buildError('"activo" debe ser booleano', 400);
      }
      input.activo = body.activo;
    }

    const repo = await getUsuarioDb();
    const useCase = new UpdateUsuarioUseCase(repo);
    const actualizado = await useCase.execute(id, input);

    if (id === session.sub) {
      const nuevoToken = signJwt({
        sub: actualizado.idUsuario,
        nombre: actualizado.nombre,
        area: actualizado.area,
        permisos: actualizado.permisos,
      });

      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, nuevoToken, getAuthCookieOptions());
    }

    return NextResponse.json({
      success: true,
      usuario: {
        idUsuario: actualizado.idUsuario,
        nombre: actualizado.nombre,
        area: actualizado.area,
        permisos: actualizado.permisos,
        activo: actualizado.activo,
        createdAt: actualizado.createdAt,
        updatedAt: actualizado.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof UsuarioNotFoundError) {
      return buildError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('usuarios PUT error:', error);
    return buildError(message, 500);
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

    const repo = await getUsuarioDb();
    const useCase = new DeleteUsuarioUseCase(repo);
    await useCase.execute(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof UsuarioNotFoundError) {
      return buildError(error.message, 404);
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('usuarios DELETE error:', error);
    return buildError(message, 500);
  }
}
