import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests } from '@/features/crm/infrastructure/getCrmDb';
import {
  FILA,
  createJsonRequest,
  crmSession,
  invalidJsonRequest,
  makeMockRepo,
  sinCrmSession,
} from '../../_lib/__tests__/fixtures';

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ getSession: mockGetSession }));

import { POST } from '../route';

const manana = (): string => {
  const d = new Date(Date.now() + 2 * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const BODY = () => ({
  razonSocial: 'Textiles Pacífico S.A.C.',
  medio: 'whatsapp',
  persona: 'Rosa Mendoza',
  telefono: '987 111 222',
  ruc: '20556677889',
  necesita: 'Exámenes para 25 personas.',
  origen: 'referido',
  proximaAccion: { tipo: 'responder', fecha: manana() },
});

describe('POST /api/crm/entrantes', () => {
  beforeEach(() => mockGetSession.mockResolvedValue(crmSession));
  afterEach(() => {
    __setCrmDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates a card in Contactado and answers 201 { empresa, existente: false } with the session user on the history entry', async () => {
    const repo = makeMockRepo();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.existente).toBe(false);
    expect(json.empresa).toBeDefined();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ etapa: 'contactado', origen: 'referido', ruc: '20556677889', sector: null }),
    );
    expect(repo.updateSeguimiento).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ etapa: 'contactado', intentosSinRespuesta: 0 }),
      expect.objectContaining({
        idUsuario: 'u-1',
        nombreUsuario: 'Scott Palomino',
        direccion: 'entrante',
        resultado: 'pendiente',
        resumen: 'Exámenes para 25 personas.',
      }),
    );
  });

  it('adds the contact to an existing empresa and answers existente: true', async () => {
    const repo = makeMockRepo({
      findByRuc: vi.fn().mockResolvedValue(FILA),
      updateSeguimiento: vi.fn().mockImplementation(async (_id, s) => ({ ...FILA, ...s })),
    });
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ existente: true, empresa: { idEmpresa: 'e-1', etapa: 'contactado' } });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['no phone or email', { ...BODY(), telefono: undefined }, 'Escribe un teléfono o un correo.'],
    ['a short RUC', { ...BODY(), ruc: '123' }, 'El RUC debe tener 11 dígitos.'],
    ['medium Otro without text', { ...BODY(), medio: 'otro' }, 'Escribe cuál fue el medio.'],
    ['no next action', { ...BODY(), proximaAccion: undefined }, 'Elige la próxima acción.'],
  ])('answers 400 with the exact message for %s and stores nothing', async (_n, body, mensaje) => {
    const repo = makeMockRepo();
    __setCrmDbForTests(repo);
    const res = await POST(createJsonRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateSeguimiento).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of the wrong shape and for non-JSON', async () => {
    __setCrmDbForTests(makeMockRepo());
    expect((await POST(createJsonRequest({ razonSocial: 3, medio: 'correo' }))).status).toBe(400);
    expect((await POST(createJsonRequest([]))).status).toBe(400);
    expect((await POST(invalidJsonRequest())).status).toBe(400);
  });

  it('answers 401 without a session and 401 without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest(BODY()))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest(BODY()))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ create: vi.fn().mockRejectedValue(new Error('secret')) }));
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al registrar el contacto entrante' });
  });
});
