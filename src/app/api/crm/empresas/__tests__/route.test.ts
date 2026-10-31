import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import { RucDuplicadoError } from '@/features/crm/domain/errors';
import {
  FILA,
  VALIDO,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockRepo,
  sinCrmSession,
} from '../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { GET, POST } from '../route';

describe('/api/crm/empresas GET', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('returns the empresas with their contacts for a session with the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockResolvedValue([FILA]) }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, empresas: [FILA] });
  });

  it.each([
    ['without a session', null],
    ['without the crm permiso', sinCrmSession],
  ])('returns 401 %s and never touches the database', async (_n, session) => {
    mockGetSession.mockResolvedValue(session);
    const list = vi.fn();
    __setCrmDbForTests(makeMockRepo({ list }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado' });
    expect(list).not.toHaveBeenCalled();
  });

  it('returns 500 with a generic message when storage fails, without leaking the cause', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ list: vi.fn().mockRejectedValue(new Error('conn string secret')) }));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al listar empresas' });
  });
});

describe('/api/crm/empresas POST', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates the empresa in Por contactar with every contact and answers 201', async () => {
    const create = vi.fn().mockImplementation(async (input) => ({ ...FILA, ...input }));
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest(VALIDO));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.empresa.contactos).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      razonSocial: 'Minera Los Tres Picos S.A.',
      ruc: '20601234567',
      etapa: 'por_contactar',
    });
  });

  it('returns 401 without the permiso and stores nothing', async () => {
    mockGetSession.mockResolvedValue(sinCrmSession);
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest(VALIDO));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not JSON', async () => {
    __setCrmDbForTests(makeMockRepo());
    const res = await POST(invalidJsonRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'El cuerpo debe ser JSON válido' });
  });

  it.each([
    ['the old single-contact shape', { razonSocial: 'A', ruc: '20601234567', contactoNombre: 'x', contactoTelefono: '9' }],
    ['contactos that is not a list', { ...VALIDO, contactos: 'Jorge' }],
    ['a contact without telefono', { ...VALIDO, contactos: [{ nombre: 'Jorge' }] }],
    ['an array instead of an object', [VALIDO]],
    ['null', null],
  ])('returns 400 for %s and stores nothing', async (_n, body) => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest(body));
    expect(res.status).toBe(400);
    const cuerpo = await res.json();
    expect(cuerpo.success).toBe(false);
    // The shape guard answers before any business rule runs.
    expect(cuerpo.error).toMatch(/Cuerpo inválido/);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ['a RUC of 10 digits', { ruc: '2060123456' }, /11 dígitos/],
    ['an unknown sector', { sector: 'Astrología' }, /Sector desconocido/],
    ['a contact with a 5-digit phone', { contactos: [{ nombre: 'A', telefono: '12345' }] }, /9 dígitos/],
    ['no contacts', { contactos: [] }, /al menos un contacto/i],
  ])('returns 400 with the reason for %s and stores nothing', async (_n, cambio, mensaje) => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create }));
    const res = await POST(createJsonRequest({ ...VALIDO, ...cambio }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(mensaje);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns 409 for a RUC already in the CRM, from the check and from the unique constraint', async () => {
    const create = vi.fn();
    __setCrmDbForTests(makeMockRepo({ create, findByRuc: vi.fn().mockResolvedValue(FILA) }));
    const res = await POST(createJsonRequest(VALIDO));
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();

    __setCrmDbForTests(makeMockRepo({ create: vi.fn().mockRejectedValue(new RucDuplicadoError(VALIDO.ruc)) }));
    const carrera = await POST(createJsonRequest(VALIDO));
    expect(carrera.status).toBe(409);
  });

  it('returns 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ create: vi.fn().mockRejectedValue(new Error('deadlock details')) }));
    const res = await POST(createJsonRequest(VALIDO));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al crear la empresa' });
  });
});
