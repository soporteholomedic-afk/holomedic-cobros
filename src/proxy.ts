import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from './lib/auth';
import { buscarRutaProtegida } from './features/auth/domain/routes';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

const publicRoutes = ['/', '/auth'];

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function isPublicRoute(path: string): boolean {
  return publicRoutes.some((r) => (r === '/' ? path === '/' : path.startsWith(r)));
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isPublicRoute(path)) {
    return NextResponse.next();
  }

  const ruta = buscarRutaProtegida(path);
  if (!ruta) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;
  const payload = token ? verifyToken(token) : null;

  const isApiRoute = path.startsWith('/api/');

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 },
      );
    }
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', path);
    return NextResponse.redirect(loginUrl);
  }

  if (!payload.permisos.includes(ruta.permiso)) {
    if (isApiRoute) {
      return NextResponse.json(
        {
          success: false,
          error: `No tenés el permiso "${ruta.permiso}" para acceder a esta API`,
          permisoRequerido: ruta.permiso,
        },
        { status: 403 },
      );
    }
    const deniedUrl = new URL('/auth/denegado', request.url);
    deniedUrl.searchParams.set('permiso', ruta.permiso);
    deniedUrl.searchParams.set('label', ruta.label);
    deniedUrl.searchParams.set('ruta', path);
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
