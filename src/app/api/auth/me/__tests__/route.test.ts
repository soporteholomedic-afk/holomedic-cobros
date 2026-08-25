import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setUsuarioDbForTests } from '@/features/auth/infrastructure/getUsuarioDb';
import type { IUsuarioRepository } from '@/features/auth/domain/ports';
import type { UsuarioRow } from '@/features/auth/domain/entities';

// ---- Mock auth session (usuarios route.test.ts precedent) ----

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET } from '../route';

// ---- Helpers ----

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
  correo: 'jdoe@holomedic.com',
  permisos: ['cobranza'],
  contrasenaHash: 'hash',
  firma: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const session = {
  sub: 'u-1',
  nombre: 'John Doe',
  area: 'cobranza',
  permisos: ['cobranza' as const],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(session);
});

afterEach(() => {
  __setUsuarioDbForTests(null);
});

describe('GET /api/auth/me — correo projection', () => {
  it('returns usuario.correo from the fresh DB read', async () => {
    __setUsuarioDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(row) }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.usuario.correo).toBe('jdoe@holomedic.com');
  });

  it('returns correo null when the user has none set', async () => {
    __setUsuarioDbForTests(
      makeMockRepo({ getById: vi.fn().mockResolvedValue({ ...row, correo: null }) }),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usuario.correo).toBeNull();
  });

  it('still rejects an missing session with 401 (regression guard)', async () => {
    mockGetSession.mockResolvedValue(null);
    __setUsuarioDbForTests(makeMockRepo());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });
});
