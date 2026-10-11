import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route contract for GET /api/crm/conversaciones/usuarios-asignables
 * (E3·T3) — the escalar target list. Pinned: session +
 * crm_conversaciones gate (the list exposes user names), the
 * permiso filter over the auth usuarios source (getUsuarioDb().list()
 * — /api/usuarios route precedent) and ONLY {id, nombre} crossing
 * the API (id = login name, the asignadaA currency). Use case mocked
 * at the module boundary (simular precedent).
 */

const mocks = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getUsuarioDbMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

vi.mock('@/features/auth/infrastructure/getUsuarioDb', () => ({
  getUsuarioDb: mocks.getUsuarioDbMock,
}));

// El use case corre REAL sobre el repo fake: la ruta cablea la fuente
// y el filtro de permiso queda cubierto end-to-end del route para abajo.

import { GET } from '../usuarios-asignables/route';
import type { IUsuarioRepository } from '@/features/auth/domain/ports';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'ventas' };

function makeUsuariosRepo(
  filas: Array<{ usuario: string; nombre: string; permisos: string[] }>,
): IUsuarioRepository {
  return {
    findByUsuario: vi.fn(),
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue(filas),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    updateFirma: vi.fn(),
    getFirma: vi.fn(),
  } as unknown as IUsuarioRepository;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_conversaciones'] });
  mocks.getUsuarioDbMock.mockResolvedValue(
    makeUsuariosRepo([
      { usuario: 'juana', nombre: 'Juana Perez', permisos: ['crm_conversaciones'] },
      { usuario: 'otros', nombre: 'Otro Usuario', permisos: ['crm'] },
    ]),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/crm/conversaciones/usuarios-asignables (E3·T3)', () => {
  it('200: filtra por permiso crm_conversaciones y cruza SOLO {id = login, nombre}', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      usuarios: [{ id: 'juana', nombre: 'Juana Perez' }],
    });
    // La fuente es el repositorio de usuarios (list, nada más).
    const repo = await mocks.getUsuarioDbMock.mock.results[0]!.value;
    expect(repo.list).toHaveBeenCalled();
  });

  it('sin sesión → 401; sin permiso crm_conversaciones → 403', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    const sinSesion = await GET();
    expect(sinSesion.status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    const sinPermiso = await GET();
    expect(sinPermiso.status).toBe(403);
    // Ni siquiera tocó la fuente de usuarios: el gate es previo.
    expect(mocks.getUsuarioDbMock).not.toHaveBeenCalled();
  });
});
