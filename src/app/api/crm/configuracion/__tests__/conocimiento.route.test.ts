// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';

/**
 * Route contract for GET /api/crm/configuracion/conocimiento
 * (agente-ia-crm E5·T6 — permiso `crm_configuracion`): read-only
 * knowledge counts for the "Conocimiento" tab. Only the db container
 * is faked (the counts come from ONE parameterless COUNT query on the
 * pool, since no repository method exposes them).
 */

const mocks = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

import { GET } from '../conocimiento/route';

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'sistemas' };

interface FilaConteo {
  grupo: 'origen' | 'estado';
  clave: string;
  total: number;
}

const queryMock = vi.fn();

function setDb(opciones: { conocimiento: boolean; filas?: FilaConteo[] }): void {
  queryMock.mockResolvedValue({ recordset: opciones.filas ?? [] });
  __setCrmDbForTests({
    pool: { request: () => ({ query: queryMock }) } as unknown as CrmDb['pool'],
    ...(opciones.conocimiento ? { conocimiento: {} } : {}),
  } as unknown as CrmDb);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_configuracion'] });
  setDb({ conocimiento: true });
});

afterEach(() => {
  __setCrmDbForTests(null);
});

describe('GET /api/crm/configuracion/conocimiento', () => {
  it('401 without session, 403 without permiso, 503 without the knowledge repo', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);

    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm_conocimiento'] });
    expect((await GET()).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();

    setDb({ conocimiento: false });
    const sinRepo = await GET();
    expect(sinRepo.status).toBe(503);
    expect(await sinRepo.json()).toMatchObject({ success: false });
  });

  it('200 counts by origen and ingesta estado, zero-filled, no-store', async () => {
    setDb({
      conocimiento: true,
      filas: [
        { grupo: 'origen', clave: 'MANUAL', total: 4 },
        { grupo: 'origen', clave: 'SUBIDO', total: 10 },
        { grupo: 'estado', clave: 'COMPLETADA', total: 6 },
        { grupo: 'estado', clave: 'FALLIDA', total: 1 },
      ],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      success: true,
      total: 14,
      porOrigen: { MANUAL: 4, SEMILLA: 0, SUBIDO: 10 },
      ingestasPorEstado: { PENDIENTE: 0, PROCESANDO: 0, COMPLETADA: 6, FALLIDA: 1 },
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown groups/keys instead of trusting the rows', async () => {
    setDb({
      conocimiento: true,
      filas: [{ grupo: 'origen', clave: 'OTRO', total: 99 }],
    });

    const body = await (await GET()).json();

    expect(body.total).toBe(0);
    expect(body.porOrigen).toEqual({ MANUAL: 0, SEMILLA: 0, SUBIDO: 0 });
  });

  it('500 without leaking the internal message when the query fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('conexión secreta rota'));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secreta');
  });
});
