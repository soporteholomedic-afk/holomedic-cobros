import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';
import { LoginUseCase } from '@/features/auth/application/login';
import { InvalidCredentialsError } from '@/features/auth/infrastructure/sqlserver';

interface LoginResponse {
  success: boolean;
  usuario?: {
    idUsuario: string;
    nombre: string;
    area: string;
    permisos: string[];
    activo: boolean;
  };
  error?: string;
}

function isLoginBody(v: unknown): v is { usuario: string; contrasena: string } {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.usuario === 'string' && obj.usuario.length > 0
    && typeof obj.contrasena === 'string' && obj.contrasena.length > 0;
}

export async function POST(request: Request): Promise<NextResponse<LoginResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'El cuerpo debe ser JSON válido' },
        { status: 400 },
      );
    }

    if (!isLoginBody(body)) {
      return NextResponse.json(
        { success: false, error: '"usuario" y "contrasena" son requeridos' },
        { status: 400 },
      );
    }

    const repo = await getUsuarioDb();
    const useCase = new LoginUseCase(repo);
    const result = await useCase.execute(body);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    return NextResponse.json({
      success: true,
      usuario: {
        idUsuario: result.usuario.idUsuario,
        nombre: result.usuario.nombre,
        area: result.usuario.area,
        permisos: result.usuario.permisos,
        activo: result.usuario.activo,
      },
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 },
      );
    }
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('login POST error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
