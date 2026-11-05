import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from './lib/auth';
import {
  buscarRutaProtegida,
  buscarRutaSoloSesion,
} from './features/auth/domain/routes';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

// login-at-entry: home `/` is no longer unconditionally public — it is a
// session-only route in RUTAS_SOLO_SESION. Only /auth/* stays public.
const publicRoutes = ['/auth'];

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function isPublicRoute(path: string): boolean {
  return publicRoutes.some((r) => path.startsWith(r));
}

/** Same contract for every unauthenticated rejection: 401 JSON for APIs,
 * login redirect (with the requested path) for page navigations. */
function noAutenticado(path: string, request: NextRequest): NextResponse {
  if (path.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'No autenticado' },
      { status: 401 },
    );
  }
  const loginUrl = new URL('/auth/login', request.url);
  loginUrl.searchParams.set('redirect', path);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (isPublicRoute(path)) {
    return NextResponse.next();
  }

  const ruta = buscarRutaProtegida(path);
  if (!ruta) {
    // login-at-entry: session-only surfaces (home, /areas indexes) need a
    // valid session but no permiso. Anything else unregistered stays open
    // (device API /api/asistencia/* authenticates with Bearer in-route).
    const soloSesion = buscarRutaSoloSesion(path);
    if (!soloSesion) {
      return NextResponse.next();
    }
    const token = request.cookies.get('token')?.value;
    if (!token || !verifyToken(token)) {
      return noAutenticado(path, request);
    }
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;
  const payload = token ? verifyToken(token) : null;

  const isApiRoute = path.startsWith('/api/');

  if (!payload) {
    return noAutenticado(path, request);
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
