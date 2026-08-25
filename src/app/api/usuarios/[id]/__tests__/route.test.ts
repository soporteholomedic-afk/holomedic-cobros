import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setUsuarioDbForTests } from '@/features/auth/infrastructure/getUsuarioDb';
import type { IUsuarioRepository } from '@/features/auth/domain/ports';
import type { UsuarioRow } from '@/features/auth/domain/entities';

// ---- Mock auth session + JWT re-sign (send-results precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
// The claims parameter types the mock's call signature so tests can
// read `mock.calls[0][0]` as the JWT claims payload.
const mockSignJwt = vi.hoisted(() =>
  vi.fn((claims: Record<string, unknown>) => JSON.stringify(claims)),
);
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  signJwt: mockSignJwt,
  COOKIE_NAME: 'holomedic_session',
  getAuthCookieOptions: vi.fn(() => ({})),
}));

// next/headers cookies: only touched when the admin edits THEMSELVES.
const mockCookieSet = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}));

// ---- Import under test (after mocks) ----

import { PUT } from '../route';

// ---- Helpers ----

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const adminSession = {
  sub: 'admin-001',
  nombre: 'Soporte Admin',
  area: 'admin',
  permisos: ['admin' as const],
};

function makeMockRepo(
  overrides: Partial<IUsuarioRepository> = {},
): IUsuarioRepository {
  return {
    findByUsuario: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    updateFirma: vi.fn(),
    getFirma: vi.fn(),
    ...overrides,
  };
}

const row: UsuarioRow = {
  idUsuario: 'u-9',
  usuario: 'jdoe',
  nombre: 'John D. Doe',
  area: 'cobranza',
  correo: null,
  permisos: ['admin'],
  contrasenaHash: 'hash',
  firma: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(adminSession);
  mockSignJwt.mockClear();
  mockCookieSet.mockClear();
});

afterEach(() => {
  __setUsuarioDbForTests(null);
});

describe('PUT /api/usuarios/[id]', () => {
  it('rejects a blank usuario (400)', async () => {
    __setUsuarioDbForTests(makeMockRepo());

    const response = await PUT(
      createJsonRequest({ usuario: '   ', nombre: 'John Doe' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects a blank nombre (400)', async () => {
    __setUsuarioDbForTests(makeMockRepo());

    const response = await PUT(
      createJsonRequest({ usuario: 'jdoe', nombre: '' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('validates and forwards usuario (trimmed); round-trip preserves both fields', async () => {
    const update = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ usuario: '  jdoe  ', nombre: 'John D. Doe' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith('u-9', {
      usuario: 'jdoe',
      nombre: 'John D. Doe',
    });
    expect(body.usuario.usuario).toBe('jdoe');
    expect(body.usuario.nombre).toBe('John D. Doe');
  });

  it('re-signs the session of a self-edit with the nombre claim only (claims unchanged)', async () => {
    // admin-001 edits themselves → re-sign path fires.
    const selfRow: UsuarioRow = {
      ...row,
      idUsuario: 'admin-001',
      nombre: 'Soporte Renamed',
    };
    __setUsuarioDbForTests(
      makeMockRepo({ update: vi.fn().mockResolvedValue(selfRow) }),
    );

    const response = await PUT(
      createJsonRequest({ usuario: 'soporte', nombre: 'Soporte Renamed' }),
      routeParams('admin-001'),
    );

    expect(response.status).toBe(200);
    expect(mockSignJwt).toHaveBeenCalledTimes(1);
    const claims = mockSignJwt.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(claims.nombre).toBe('Soporte Renamed');
    expect('usuario' in claims).toBe(false); // design decision 2: no usuario claim
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/usuarios/[id] — correo', () => {
  it('sets a valid correo (trimmed) and returns it in the projection', async () => {
    const updatedRow: UsuarioRow = { ...row, correo: 'nueva@holomedic.com' };
    const update = vi.fn().mockResolvedValue(updatedRow);
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ correo: '  nueva@holomedic.com  ' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith('u-9', { correo: 'nueva@holomedic.com' });
    expect(body.usuario.correo).toBe('nueva@holomedic.com');
  });

  it('clears the correo when the body carries an empty string', async () => {
    const update = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ correo: '' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith('u-9', { correo: null });
    expect(body.usuario.correo).toBeNull();
  });

  it('clears the correo when the body carries an explicit null', async () => {
    const update = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ correo: null }),
      routeParams('u-9'),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith('u-9', { correo: null });
  });

  it('rejects an invalid correo with a 400 naming the field, without echoing the value', async () => {
    const update = vi.fn();
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ correo: 'a@' }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('correo');
    expect(body.error).not.toContain('a@');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a non-string correo with a 400', async () => {
    const update = vi.fn();
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ correo: 42 }),
      routeParams('u-9'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('correo');
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves the correo untouched when the key is omitted', async () => {
    const update = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ update }));

    const response = await PUT(
      createJsonRequest({ nombre: 'Solo Nombre' }),
      routeParams('u-9'),
    );

    expect(response.status).toBe(200);
    const forwarded = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(forwarded).toEqual({ nombre: 'Solo Nombre' });
    expect('correo' in forwarded).toBe(false);
  });

  it('self-edit including correo re-signs a token with NO correo claim', async () => {
    const selfRow: UsuarioRow = {
      ...row,
      idUsuario: 'admin-001',
      nombre: 'Soporte Renamed',
      correo: 'soporte@holomedic.com',
    };
    __setUsuarioDbForTests(
      makeMockRepo({ update: vi.fn().mockResolvedValue(selfRow) }),
    );

    const response = await PUT(
      createJsonRequest({ nombre: 'Soporte Renamed', correo: 'soporte@holomedic.com' }),
      routeParams('admin-001'),
    );

    expect(response.status).toBe(200);
    expect(mockSignJwt).toHaveBeenCalledTimes(1);
    const claims = mockSignJwt.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(claims.sub).toBe('admin-001');
    expect(claims.nombre).toBe('Soporte Renamed');
    expect(claims.area).toBe('cobranza');
    expect(claims.permisos).toEqual(['admin']);
    expect('correo' in claims).toBe(false); // JWT carries no correo claim
  });
});
