// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCrmConfigRepository: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession }));
vi.mock('@/features/crm/infrastructure/getCrmDb', () => ({
  getCrmConfigRepository: mocks.getCrmConfigRepository,
}));

import { GET } from '../route';

/**
 * Route contract for GET /api/crm/ruc/[ruc] (crm-consulta-sunat T4,
 * S1/S5). Use cases and the apifacturacion adapter are the REAL ones;
 * only the session, the CrmConfig repository port and the global fetch
 * are faked (T2 configuracion.route.test precedent).
 */

const TOKEN = 'tok-ruta-ruc';
const RUC = '20525426778';
const SESION = { sub: 'u-1', nombre: 'Scott Palomino', area: 'Comercial', permisos: ['crm'] };
const SIN_PERMISO = { ...SESION, permisos: ['cobranza'] };

const TOKEN_ORIGINAL = process.env.APIFACTURACION_TOKEN;
const JSON_OK = JSON.stringify({
  razon_social: 'CONSTRUCTORES ANDINA S.A.C.',
  direccion: 'Av. Los Próceres 210, San Isidro',
  ubigeo: '150115',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
});

function contexto(ruc: string): { params: Promise<{ ruc: string }> } {
  return { params: Promise.resolve({ ruc }) };
}

function respuestaApifacturacion(status: number, cuerpo: string): Response {
  return new Response(cuerpo, { status, headers: { 'Content-Type': 'application/json' } });
}

describe('GET /api/crm/ruc/[ruc]', () => {
  beforeEach(() => {
    delete process.env.APIFACTURACION_TOKEN;
    mocks.getSession.mockResolvedValue(SESION);
    mocks.getCrmConfigRepository.mockResolvedValue({ listar: vi.fn().mockResolvedValue([]) });
  });

  afterEach(() => {
    if (TOKEN_ORIGINAL === undefined) delete process.env.APIFACTURACION_TOKEN;
    else process.env.APIFACTURACION_TOKEN = TOKEN_ORIGINAL;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('devuelve 200 { success, datos } con los datos mapeados y SIN el token', async () => {
    process.env.APIFACTURACION_TOKEN = TOKEN;
    const fetchMock = vi.fn().mockResolvedValue(respuestaApifacturacion(200, JSON_OK));
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      datos: {
        razonSocial: 'CONSTRUCTORES ANDINA S.A.C.',
        direccion: 'Av. Los Próceres 210, San Isidro',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
      },
    });
    expect(JSON.stringify(json)).not.toContain(TOKEN);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.apifacturacion.com/ruc/${RUC}`);
    expect(init.method).toBe('POST');
  });

  it('sin sesión responde 401 sin resolver config ni llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(null);

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'No autorizado' });
    expect(mocks.getCrmConfigRepository).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sesión SIN el permiso crm responde 401 sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(SIN_PERMISO);

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RUC inválido responde 400 sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(new Request('http://localhost:3000/api/crm/ruc/123'), contexto('123'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'El RUC debe tener 11 dígitos.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin token configurado responde 503 con estado claro (S5) sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('no está configurada');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RUC sin datos en apifacturacion responde 404', async () => {
    process.env.APIFACTURACION_TOKEN = TOKEN;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respuestaApifacturacion(200, JSON.stringify({ error: 'sin datos' }))),
    );

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain(RUC);
  });

  it('fallo de red de apifacturacion responde 502', async () => {
    process.env.APIFACTURACION_TOKEN = TOKEN;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('No se pudo conectar con apifacturacion');
  });

  it('HTTP fallido de apifacturacion responde 502', async () => {
    process.env.APIFACTURACION_TOKEN = TOKEN;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaApifacturacion(500, '{}')));

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('HTTP 500');
    // ServicioConsultaError is MAPPED, not logged as an unknown crash.
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('fallo NO mapeado (config ilegible) responde 500 genérico sin filtrar la causa', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getCrmConfigRepository.mockRejectedValue(new Error('db-down-secreto'));

    const res = await GET(new Request(`http://localhost:3000/api/crm/ruc/${RUC}`), contexto(RUC));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: 'Error al consultar el RUC' });
    expect(JSON.stringify(json)).not.toContain('db-down-secreto');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
