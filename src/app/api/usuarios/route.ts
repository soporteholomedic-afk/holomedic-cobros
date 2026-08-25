import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import type { Permiso } from '@/features/auth/domain/entities';
import { PERMISOS } from '@/features/auth/domain/entities';
import { isValidCorreo } from '@/features/auth/domain/correo';
import { ListUsuariosUseCase } from '@/features/auth/application/listarUsuarios';
import { CreateUsuarioUseCase } from '@/features/auth/application/crearUsuario';

interface ErrorResponse {
  success: false;
  error: string;
}

function buildError(error: string, status: number): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

function isPermiso(v: unknown): v is Permiso {
  return typeof v === 'string' && (PERMISOS as readonly string[]).includes(v);
}

function isCreateBody(v: unknown): v is {
  usuario: string;
  nombre: string;
  area: string;
  permisos: Permiso[];
  contrasena: string;
} {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.usuario !== 'string' || obj.usuario.trim().length === 0) return false;
  if (typeof obj.nombre !== 'string' || obj.nombre.trim().length === 0) return false;
  if (typeof obj.area !== 'string' || obj.area.trim().length === 0) return false;
  if (typeof obj.contrasena !== 'string' || obj.contrasena.length < 4) return false;
  if (!Array.isArray(obj.permisos)) return false;
  if (!obj.permisos.every(isPermiso)) return false;
  return true;
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session || !session.permisos.includes('admin')) {
      return buildError('No autorizado', 401);
    }

    const repo = await getUsuarioDb();
    const useCase = new ListUsuariosUseCase(repo);
    const usuarios = await useCase.execute();

    const sinHash = usuarios.map((u) => ({
      idUsuario: u.idUsuario,
      usuario: u.usuario,
      nombre: u.nombre,
      area: u.area,
      correo: u.correo,
      permisos: u.permisos,
      activo: u.activo,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return NextResponse.json({ success: true, usuarios: sinHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('usuarios GET error:', error);
    return buildError(message, 500);
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
      return buildError(
        'Cuerpo inválido. Requiere: {usuario, nombre, area, permisos, contrasena}',
        400,
      );
    }

    // Optional correo: undefined/null/blank → NULL; string → trim +
    // validate. The submitted value is never echoed back (PII).
    let correo: string | null = null;
    const rawCorreo = (body as { correo?: unknown }).correo;
    if (rawCorreo !== undefined && rawCorreo !== null) {
      if (typeof rawCorreo !== 'string') {
        return buildError('Campo correo inválido: debe ser texto', 400);
      }
      const trimmedCorreo = rawCorreo.trim();
      if (trimmedCorreo !== '' && !isValidCorreo(trimmedCorreo)) {
        return buildError(
          'Campo correo inválido: debe ser un correo electrónico válido',
          400,
        );
      }
      correo = trimmedCorreo === '' ? null : trimmedCorreo;
    }

    const repo = await getUsuarioDb();
    const useCase = new CreateUsuarioUseCase(repo);
    const creado = await useCase.execute({
      usuario: body.usuario.trim(),
      nombre: body.nombre.trim(),
      area: body.area.trim(),
      correo,
      permisos: body.permisos,
      contrasena: body.contrasena,
    });

    return NextResponse.json(
      {
        success: true,
        usuario: {
          idUsuario: creado.idUsuario,
          usuario: creado.usuario,
          nombre: creado.nombre,
          area: creado.area,
          correo: creado.correo,
          permisos: creado.permisos,
          activo: creado.activo,
          createdAt: creado.createdAt,
          updatedAt: creado.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('usuarios POST error:', error);
    return buildError(message, 500);
  }
}
