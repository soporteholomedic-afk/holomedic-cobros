import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { SectorDuplicadoError } from '@/features/crm/domain/errors';
import {
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockRepo,
  sinCrmSession,
} from '../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET, POST } from '../route';

describe('/api/crm/sectores', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('GET lists the sectors with their icon', async () => {
    __setCrmDbForTests(makeMockRepo());
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sectores: [
        { nombre: 'Construcción', icono: 'casco' },
        { nombre: 'Comercio y Tiendas', icono: 'tienda' },
      ],
    });
  });

  it('POST creates a sector with the name cleaned up and answers 201', async () => {
    const createSector = vi.fn().mockImplementation(async (n: string, icono: string | null) => ({ nombre: n, icono }));
    __setCrmDbForTests(makeMockRepo({ createSector }));
    const res = await POST(createJsonRequest({ nombre: '  Educación   y  Cultura ' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, sector: { nombre: 'Educación y Cultura', icono: null } });
    expect(createSector).toHaveBeenCalledWith('Educación y Cultura', null);
  });

  it('POST stores the icon and answers the stored sector', async () => {
    const createSector = vi.fn().mockImplementation(async (n: string, icono: string | null) => ({ nombre: n, icono }));
    __setCrmDbForTests(makeMockRepo({ createSector }));
    const res = await POST(createJsonRequest({ nombre: 'Clínicas', icono: 'salud' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, sector: { nombre: 'Clínicas', icono: 'salud' } });
    expect(createSector).toHaveBeenCalledWith('Clínicas', 'salud');
  });

  it('POST returns 409 for a duplicated name', async () => {
    __setCrmDbForTests(makeMockRepo({ createSector: vi.fn().mockRejectedValue(new SectorDuplicadoError('Construcción')) }));
    const res = await POST(createJsonRequest({ nombre: 'construcción' }));
    expect(res.status).toBe(409);
  });

  it.each([
    ['non-JSON', invalidJsonRequest()],
    ['no nombre', createJsonRequest({})],
    ['a numeric nombre', createJsonRequest({ nombre: 4 })],
    ['a blank nombre', createJsonRequest({ nombre: '   ' })],
    ['a nombre over 50 characters', createJsonRequest({ nombre: 'x'.repeat(51) })],
    ['an unknown icono', createJsonRequest({ nombre: 'Clínicas', icono: 'cohete' })],
    ['a non-text icono', createJsonRequest({ nombre: 'Clínicas', icono: 7 })],
  ])('POST returns 400 for %s and stores nothing', async (_n, request) => {
    const createSector = vi.fn();
    __setCrmDbForTests(makeMockRepo({ createSector }));
    const res = await POST(request);
    expect(res.status).toBe(400);
    expect(createSector).not.toHaveBeenCalled();
  });

  it('both methods return 401 without the crm permiso and never touch the database', async () => {
    mockGetSession.mockResolvedValue(sinCrmSession);
    const listSectores = vi.fn();
    const createSector = vi.fn();
    __setCrmDbForTests(makeMockRepo({ listSectores, createSector }));
    expect((await GET()).status).toBe(401);
    expect((await POST(createJsonRequest({ nombre: 'X' }))).status).toBe(401);
    expect(listSectores).not.toHaveBeenCalled();
    expect(createSector).not.toHaveBeenCalled();
  });
});
