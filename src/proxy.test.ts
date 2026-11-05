import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { signJwt } from './lib/auth';

const PDF_API_PATH = '/api/areas/musculoesqueletica/jjc/12345/pdf';

function fakeRequest(pathname: string, token?: string): NextRequest {
  return {
    nextUrl: {
      pathname,
      search: '',
      searchParams: new URLSearchParams(),
    },
    url: `http://localhost${pathname}`,
    cookies: {
      get: (name: string) =>
        name === 'token' && token ? { value: token } : undefined,
    },
  } as unknown as NextRequest;
}

function tokenFor(permisos: string[]): string {
  return signJwt({ sub: 'u1', nombre: 'Usuario Test', area: 'test', permisos });
}

describe('proxy — PDF API route protection', () => {
  it('rejects unauthenticated API requests with 401 and no clinical data', async () => {
    const res = proxy(fakeRequest(PDF_API_PATH));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'No autenticado' });
    expect(body).not.toHaveProperty('paciente');
    expect(body).not.toHaveProperty('dni');
  });

  it('rejects authenticated users without the jjc permission with 403', async () => {
    const res = proxy(fakeRequest(PDF_API_PATH, tokenFor(['cobranza'])));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.permisoRequerido).toBe('jjc');
    expect(JSON.stringify(body)).not.toContain('paciente');
  });

  it('lets authenticated users with the jjc permission through', async () => {
    const res = proxy(fakeRequest(PDF_API_PATH, tokenFor(['jjc'])));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('redirects unauthenticated page navigations to login', () => {
    const res = proxy(fakeRequest('/areas/musculoesqueletica/jjc'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/login');
  });
});

describe('proxy — session-only routes (login at platform entry)', () => {
  it('home / unauthenticated → redirect to login with redirect=%2F', () => {
    const res = proxy(fakeRequest('/'));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/login');
    expect(location).toContain(`redirect=${encodeURIComponent('/')}`);
  });

  it('home / with any valid session (even zero permisos) → pass', () => {
    const res = proxy(fakeRequest('/', tokenFor([])));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
  });

  it('area index /areas/medicina unauthenticated → login redirect', () => {
    const res = proxy(fakeRequest('/areas/medicina'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/login');
  });

  it('area index /areas/medicina with session but no matching permiso → pass (session-only, no permiso gate)', () => {
    const res = proxy(fakeRequest('/areas/medicina', tokenFor(['cobranza'])));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
  });

  it('registered permiso route wins longest-first: /areas/medicina/jjc without jjc → denegado', () => {
    const res = proxy(fakeRequest('/areas/medicina/jjc', tokenFor(['cobranza'])));
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/denegado');
    expect(location).toContain('permiso=jjc');
  });

  it('unregistered device API /api/asistencia/heartbeat still passes with no cookie (Bearer in-route)', () => {
    const res = proxy(fakeRequest('/api/asistencia/heartbeat'));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
  });
});