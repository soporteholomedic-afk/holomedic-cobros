import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests, __setCrmOportunidadesDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { EtapaInvalidaError } from '@/features/crm/domain/errors';
import {
  FILA,
  OPORTUNIDAD,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockOportunidadesRepo,
  makeMockRepo,
  sinCrmSession,
} from '../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET, POST } from '../route';

const BODY = () => ({ idEmpresa: 'e-1', nombre: 'Exámenes ocupacionales 2026' });

describe('/api/crm/oportunidades GET', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('answers 200 { oportunidades } exactly as the repository lists them (newest first)', async () => {
    const segunda = { ...OPORTUNIDAD, idOportunidad: 'o-2', etapa: 'cotizado' as const };
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ list: vi.fn().mockResolvedValue([OPORTUNIDAD, segunda]) }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, oportunidades: [OPORTUNIDAD, segunda] });
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('answers 401 %s and never touches the database', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const list = vi.fn();
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ list }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado' });
    expect(list).not.toHaveBeenCalled();
  });

  it('answers 500 with a generic message when storage fails, without leaking the cause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ list: vi.fn().mockRejectedValue(new Error('conn string secret')) }),
    );
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al listar oportunidades' });
  });
});

describe('/api/crm/oportunidades POST', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates the deal in Por contactar by default, with no medium, and answers 201', async () => {
    const create = vi.fn().mockImplementation(async (_id, datos) => ({ ...OPORTUNIDAD, ...datos }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.oportunidad).toMatchObject({ idEmpresa: 'e-1', nombre: 'Exámenes ocupacionales 2026', etapa: 'por_contactar', medio: null });
    expect(create).toHaveBeenCalledWith('e-1', expect.objectContaining({ etapa: 'por_contactar', medio: null, medioOtro: null }));
  });

  it('creates the deal in the stage sent, storing its medium; Por contactar ignores any medium', async () => {
    const create = vi.fn().mockImplementation(async (_id, datos) => ({ ...OPORTUNIDAD, ...datos }));
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    await POST(createJsonRequest({ ...BODY(), etapa: 'cotizado', medio: 'correo', montoEstimado: 7000, servicio: 'Exámenes' }));
    expect(create).toHaveBeenLastCalledWith(
      'e-1',
      expect.objectContaining({ etapa: 'cotizado', medio: 'correo', montoEstimado: 7000, servicio: 'Exámenes' }),
    );
    await POST(createJsonRequest({ ...BODY(), etapa: 'por_contactar', medio: 'correo' }));
    expect(create).toHaveBeenLastCalledWith('e-1', expect.objectContaining({ etapa: 'por_contactar', medio: null }));
  });

  it('answers 401 without the permiso and stores nothing', async () => {
    mockGetSession.mockResolvedValue(sinCrmSession);
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await POST(invalidJsonRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'El cuerpo debe ser JSON válido' });
  });

  it.each([
    ['a body without idEmpresa', { nombre: 'X' }],
    ['a numeric idEmpresa', { idEmpresa: 3, nombre: 'X' }],
    ['a body without nombre', { idEmpresa: 'e-1' }],
    ['an array instead of an object', [BODY()]],
    ['null', null],
  ])('returns 400 for %s and stores nothing', async (_n, body) => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    const res = await POST(createJsonRequest(body));
    expect(res.status).toBe(400);
    const cuerpo = await res.json();
    expect(cuerpo.success).toBe(false);
    // The shape guard answers before any business rule runs.
    expect(cuerpo.error).toMatch(/Cuerpo inválido/);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty name', { nombre: '   ' }, /nombre de la oportunidad es obligatorio/],
    ['an invalid stage', { nombre: 'X', etapa: 'archivado' }, /Etapa inválida/],
    ['an unknown origin', { nombre: 'X', origen: 'tv' }, /cómo nos conoció/],
    ['a zero amount', { nombre: 'X', montoEstimado: 0 }, /mayor a 0/],
    ['a text amount', { nombre: 'X', montoEstimado: '7000' }, /mayor a 0/],
    ['a medium on Contactado', { nombre: 'X', etapa: 'contactado', medio: 'telepatía' }, /medio de contacto/],
  ])('returns 400 with the reason for %s and stores nothing', async (_n, cambio, mensaje) => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    const res = await POST(createJsonRequest({ ...BODY(), ...cambio }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown empresa and stores nothing', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo());
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo({ create }));
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Empresa no encontrada' });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ getById: vi.fn().mockResolvedValue(FILA) }));
    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ create: vi.fn().mockRejectedValue(new EtapaInvalidaError('x')) }),
    );
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Etapa inválida: x' });

    __setCrmOportunidadesDbForTests(
      makeMockOportunidadesRepo({ create: vi.fn().mockRejectedValue(new Error('deadlock details')) }),
    );
    const fallo = await POST(createJsonRequest(BODY()));
    expect(fallo.status).toBe(500);
    expect(await fallo.json()).toEqual({ success: false, error: 'Error al crear la oportunidad' });
  });
});
