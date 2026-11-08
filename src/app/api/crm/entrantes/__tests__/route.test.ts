import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setCrmDbForTests, __setCrmOportunidadesDbForTests } from '@/features/crm/infrastructure/getCrmDb';
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
    __setCrmOportunidadesDbForTests(null);
    vi.restoreAllMocks();
  });

  it('creates the ficha AND its first deal in Contactado, answering 201 { empresa, oportunidad, existente: false }', async () => {
    const repo = makeMockRepo();
    const oportunidades = makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(OPORTUNIDAD) });
    __setCrmDbForTests(repo);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.existente).toBe(false);
    expect(json.empresa).toMatchObject({ idEmpresa: 'e-1', relacion: 'prospecto' });
    // The response carries the deal re-read after the follow-up write (T4 use case).
    expect(json.oportunidad).toMatchObject({ idEmpresa: 'e-1', etapa: 'contactado' });
    // The ficha carries no deal state anymore; the deal is created separately.
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruc: '20556677889', sector: null, relacion: 'prospecto' }),
    );
    const cuerpoEmpresa = (repo.create as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls[0]?.[0];
    expect(cuerpoEmpresa).not.toHaveProperty('etapa');
    expect(oportunidades.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nombre: 'Exámenes para 25 personas.', origen: 'referido', etapa: 'contactado', medio: 'whatsapp' }),
    );
    expect(oportunidades.updateSeguimiento).toHaveBeenCalledWith(
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

  it('a new ficha takes the chosen sector, resolved to the stored name', async () => {
    const repo = makeMockRepo();
    const oportunidades = makeMockOportunidadesRepo({ getById: vi.fn().mockResolvedValue(OPORTUNIDAD) });
    __setCrmDbForTests(repo);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest({ ...BODY(), sector: 'construcción' }));
    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ sector: 'Construcción' }));
  });

  it('answers 400 "Sector desconocido" for an unknown sector and stores nothing', async () => {
    const repo = makeMockRepo();
    const oportunidades = makeMockOportunidadesRepo();
    __setCrmDbForTests(repo);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest({ ...BODY(), sector: 'Astrología' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Sector desconocido: Astrología' });
    expect(repo.create).not.toHaveBeenCalled();
    expect(oportunidades.create).not.toHaveBeenCalled();
  });

  it('answers 400 for a non-text sector', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    expect((await POST(createJsonRequest({ ...BODY(), sector: 4 }))).status).toBe(400);
  });

  it('adds the deal to an existing ficha (existente: true) without touching its relacion', async () => {
    const repo = makeMockRepo({ findByRuc: vi.fn().mockResolvedValue(FILA) });
    const oportunidades = makeMockOportunidadesRepo({
      getById: vi.fn().mockResolvedValue(OPORTUNIDAD),
      updateSeguimiento: vi.fn().mockImplementation(async (_id, s) => ({ ...OPORTUNIDAD, ...s })),
    });
    __setCrmDbForTests(repo);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.existente).toBe(true);
    expect(json.empresa).toMatchObject({ idEmpresa: 'e-1', relacion: 'prospecto' });
    expect(json.oportunidad).toMatchObject({ idEmpresa: 'e-1', etapa: 'contactado' });
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.updateRelacion).not.toHaveBeenCalled();
    expect(oportunidades.create).toHaveBeenCalledWith('e-1', expect.objectContaining({ etapa: 'contactado' }));
  });

  it.each([
    ['no phone or email', { ...BODY(), telefono: undefined }, 'Escribe un teléfono o un correo.'],
    ['a short RUC', { ...BODY(), ruc: '123' }, 'El RUC debe tener 11 dígitos.'],
    ['medium Otro without text', { ...BODY(), medio: 'otro' }, 'Escribe cuál fue el medio.'],
    ['no next action', { ...BODY(), proximaAccion: undefined }, 'Elige la próxima acción.'],
  ])('answers 400 with the exact message for %s and stores nothing', async (_n, body, mensaje) => {
    const repo = makeMockRepo();
    const oportunidades = makeMockOportunidadesRepo();
    __setCrmDbForTests(repo);
    __setCrmOportunidadesDbForTests(oportunidades);
    const res = await POST(createJsonRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: mensaje });
    expect(repo.create).not.toHaveBeenCalled();
    expect(oportunidades.create).not.toHaveBeenCalled();
  });

  it('answers 400 for a body of the wrong shape and for non-JSON', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    expect((await POST(createJsonRequest({ razonSocial: 3, medio: 'correo' }))).status).toBe(400);
    expect((await POST(createJsonRequest([]))).status).toBe(400);
    expect((await POST(invalidJsonRequest())).status).toBe(400);
  });

  it('answers 401 without a session and 401 without the crm permiso', async () => {
    __setCrmDbForTests(makeMockRepo());
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    mockGetSession.mockResolvedValue(null);
    expect((await POST(createJsonRequest(BODY()))).status).toBe(401);
    mockGetSession.mockResolvedValue(sinCrmSession);
    expect((await POST(createJsonRequest(BODY()))).status).toBe(401);
  });

  it('answers 500 without leaking the cause when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setCrmDbForTests(makeMockRepo({ create: vi.fn().mockRejectedValue(new Error('secret')) }));
    __setCrmOportunidadesDbForTests(makeMockOportunidadesRepo());
    const res = await POST(createJsonRequest(BODY()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error al registrar el contacto entrante' });
  });
});
