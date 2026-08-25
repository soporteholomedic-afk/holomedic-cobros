import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setUsuarioDbForTests } from '@/features/auth/infrastructure/getUsuarioDb';
import type { IUsuarioRepository } from '@/features/auth/domain/ports';
import type { UsuarioRow } from '@/features/auth/domain/entities';

// ---- Mock auth session (send-results route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET, POST } from '../route';

// ---- Helpers ----

function createJsonRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as Request;
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
  idUsuario: 'u-1',
  usuario: 'jdoe',
  nombre: 'John Doe',
  area: 'cobranza',
  correo: null,
  permisos: ['admin'],
  contrasenaHash: 'hash',
  firma: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const rowWithCorreo: UsuarioRow = {
  ...row,
  correo: 'jdoe@holomedic.com',
};

const validCreateBody = {
  usuario: 'asmith',
  nombre: 'Alice Smith',
  area: 'consolidados',
  permisos: ['consolidados'],
  contrasena: 'secreta',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(adminSession);
});

afterEach(() => {
  __setUsuarioDbForTests(null);
});

describe('GET /api/usuarios', () => {
  it('maps BOTH usuario and nombre onto every listed row', async () => {
    __setUsuarioDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([row]) }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usuarios).toHaveLength(1);
    expect(body.usuarios[0].usuario).toBe('jdoe');
    expect(body.usuarios[0].nombre).toBe('John Doe');
    expect(body.usuarios[0].contrasenaHash).toBeUndefined();
  });

  it('includes correo in the list projection (null when unset)', async () => {
    __setUsuarioDbForTests(
      makeMockRepo({ list: vi.fn().mockResolvedValue([row, rowWithCorreo]) }),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usuarios).toHaveLength(2);
    expect(body.usuarios[0].correo).toBeNull();
    expect(body.usuarios[1].correo).toBe('jdoe@holomedic.com');
  });
});

describe('POST /api/usuarios', () => {
  it('rejects a create body with an empty usuario (400)', async () => {
    __setUsuarioDbForTests(makeMockRepo());

    const response = await POST(
      createJsonRequest({ ...validCreateBody, usuario: '   ' }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects a create body with an empty nombre (400)', async () => {
    __setUsuarioDbForTests(makeMockRepo());

    const response = await POST(
      createJsonRequest({ ...validCreateBody, nombre: '' }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('creates a user carrying both fields and returns them (201 round-trip)', async () => {
    const create = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ create }));

    const response = await POST(createJsonRequest(validCreateBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      usuario: 'asmith',
      nombre: 'Alice Smith',
      area: 'consolidados',
      correo: null,
      permisos: ['consolidados'],
      contrasena: 'secreta',
    });
    expect(body.usuario.usuario).toBe('jdoe');
    expect(body.usuario.nombre).toBe('John Doe');
    expect(body.usuario.correo).toBeNull();
  });

  it('creates a user with a valid correo and returns it (201)', async () => {
    const create = vi.fn().mockResolvedValue(rowWithCorreo);
    __setUsuarioDbForTests(makeMockRepo({ create }));

    const response = await POST(
      createJsonRequest({ ...validCreateBody, correo: '  alice@holomedic.com  ' }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({
      usuario: 'asmith',
      nombre: 'Alice Smith',
      area: 'consolidados',
      correo: 'alice@holomedic.com',
      permisos: ['consolidados'],
      contrasena: 'secreta',
    });
    expect(body.usuario.correo).toBe('jdoe@holomedic.com');
  });

  it('rejects an invalid correo with a 400 naming the field, without echoing the value', async () => {
    const create = vi.fn();
    __setUsuarioDbForTests(makeMockRepo({ create }));

    const response = await POST(
      createJsonRequest({ ...validCreateBody, correo: 'no-es-mail' }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('"correo" inválido: debe ser un correo electrónico válido');
    expect(body.error).not.toContain('no-es-mail');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a non-string correo with a 400', async () => {
    const create = vi.fn();
    __setUsuarioDbForTests(makeMockRepo({ create }));

    const response = await POST(
      createJsonRequest({ ...validCreateBody, correo: 123 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('"correo" inválido: debe ser texto');
    expect(create).not.toHaveBeenCalled();
  });

  it('treats an empty-string correo as unset (null)', async () => {
    const create = vi.fn().mockResolvedValue(row);
    __setUsuarioDbForTests(makeMockRepo({ create }));

    const response = await POST(
      createJsonRequest({ ...validCreateBody, correo: '   ' }),
    );

    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ correo: null }),
    );
  });
});
