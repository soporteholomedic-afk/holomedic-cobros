import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUsuarioDb } from '@/features/auth/infrastructure/getUsuarioDb';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 },
      );
    }

    const repo = await getUsuarioDb();
    const usuario = await repo.getById(session.sub);

    if (!usuario || !usuario.activo) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado o inactivo' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      usuario: {
        idUsuario: usuario.idUsuario,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        area: usuario.area,
        permisos: usuario.permisos,
        activo: usuario.activo,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('auth/me error:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
