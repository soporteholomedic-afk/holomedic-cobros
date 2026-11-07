// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntradaConfigCrm } from '@/features/crm/domain/entities';
import type {
  ConfigCrmRepository,
  EliminarConfigInput,
  GuardarConfigInput,
} from '@/features/crm/domain/ports';
import { cifrarSecreto } from '@/features/crm/infrastructure/config/cifradoSecretos';
import {
  CLAVE_CONFIG_APIFACTURACION_TOKEN,
  CLAVE_CONFIG_APIFACTURACION_URL,
  URL_APIFACTURACION_POR_DEFECTO,
} from '@/features/crm/application/configuracion/configApifacturacion';

/**
 * Route contract for /api/crm/configuracion/apifacturacion{,/probar}
 * (crm-consulta-sunat T2 — permiso `crm_configuracion`). Use cases are
 * the REAL ones; only the ConfigCrmRepository port and the session are
 * faked (E5·T4 configuracion.route.test precedent).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCrmConfigRepository: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSession }));
vi.mock('@/features/crm/infrastructure/getCrmDb', () => ({
  getCrmConfigRepository: mocks.getCrmConfigRepository,
}));

import { GET, PUT } from '../route';
import { POST } from '../probar/route';

const CLAVE_ORIGINAL = process.env.CRM_CONFIG_KEY;
const CLAVE_TEST = randomBytes(32).toString('base64');
const ENV_TEST = { CRM_CONFIG_KEY: CLAVE_TEST };
const TOKEN = 'tok-privado-de-ruta';
const SESION = {
  sub: 'u-1',
  nombre: 'Scott Palomino',
  area: 'Comercial',
  permisos: ['crm', 'crm_configuracion'],
};
const SESION_SIN_PERMISO = { ...SESION, permisos: ['crm'] };

class FakeConfig implements Pick<ConfigCrmRepository, 'listar' | 'guardar' | 'eliminar'> {
  filas = new Map<string, EntradaConfigCrm>();
  guardados: GuardarConfigInput[] = [];
  eliminados: EliminarConfigInput[] = [];

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    return [...this.filas.values()].filter((fila) => fila.clave.startsWith(prefijo));
  }

  async guardar(input: GuardarConfigInput): Promise<void> {
    this.guardados.push({ ...input });
    this.filas.set(input.clave, {
      clave: input.clave,
      valor: input.valor,
      esSecreto: input.esSecreto,
      actualizadoPor: input.usuario,
      actualizadoEn: new Date('2026-11-08T10:00:00.000Z'),
    });
  }

  async eliminar(input: EliminarConfigInput): Promise<void> {
    this.eliminados.push({ ...input });
    this.filas.delete(input.clave);
  }

  sembrar(fila: EntradaConfigCrm): void {
    this.filas.set(fila.clave, fila);
  }
}

function fila(clave: string, valor: string, esSecreto: boolean): EntradaConfigCrm {
  return {
    clave,
    valor,
    esSecreto,
    actualizadoPor: 'seed',
    actualizadoEn: new Date('2026-11-08T10:00:00.000Z'),
  };
}

function peticionJson(metodo: 'PUT' | 'POST', cuerpo?: unknown): Request {
  return new Request('http://localhost:3000/api/crm/configuracion/apifacturacion', {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

describe('GET /api/crm/configuracion/apifacturacion', () => {
  let repo: FakeConfig;

  beforeEach(() => {
    process.env.CRM_CONFIG_KEY = CLAVE_TEST;
    repo = new FakeConfig();
    mocks.getCrmConfigRepository.mockResolvedValue(repo);
    mocks.getSession.mockResolvedValue(SESION);
  });

  afterEach(() => {
    if (CLAVE_ORIGINAL === undefined) delete process.env.CRM_CONFIG_KEY;
    else process.env.CRM_CONFIG_KEY = CLAVE_ORIGINAL;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('devuelve el estado con el token SOLO enmascarado (nunca en claro)', async () => {
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto(TOKEN, ENV_TEST), true));
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_URL, 'https://api.qa.example.com', false));

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.configuracion).toEqual({
      configurado: true,
      tokenMascarado: expect.stringContaining('••••'),
      url: 'https://api.qa.example.com',
      fuente: 'db',
    });
    expect(JSON.stringify(json)).not.toContain(TOKEN);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('sin token configurado: configurado false, url default, fuente ninguna', async () => {
    const original = process.env.APIFACTURACION_TOKEN;
    delete process.env.APIFACTURACION_TOKEN;
    try {
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.configuracion).toEqual({
        configurado: false,
        tokenMascarado: null,
        url: URL_APIFACTURACION_POR_DEFECTO,
        fuente: 'ninguna',
      });
    } finally {
      if (original !== undefined) process.env.APIFACTURACION_TOKEN = original;
    }
  });

  it('sin sesión responde 401 sin tocar el repositorio', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getCrmConfigRepository).not.toHaveBeenCalled();
  });

  it('con sesión sin crm_configuracion responde 403', async () => {
    mocks.getSession.mockResolvedValue(SESION_SIN_PERMISO);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mocks.getCrmConfigRepository).not.toHaveBeenCalled();
  });

  it('un fallo del repositorio responde 500 genérico', async () => {
    mocks.getCrmConfigRepository.mockRejectedValue(new Error('mssql down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await GET();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    } finally {
      error.mockRestore();
    }
  });
});

describe('PUT /api/crm/configuracion/apifacturacion', () => {
  let repo: FakeConfig;

  beforeEach(() => {
    process.env.CRM_CONFIG_KEY = CLAVE_TEST;
    repo = new FakeConfig();
    mocks.getCrmConfigRepository.mockResolvedValue(repo);
    mocks.getSession.mockResolvedValue(SESION);
  });

  afterEach(() => {
    if (CLAVE_ORIGINAL === undefined) delete process.env.CRM_CONFIG_KEY;
    else process.env.CRM_CONFIG_KEY = CLAVE_ORIGINAL;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('guarda token y url con el usuario de la sesión y responde el estado actualizado', async () => {
    const res = await PUT(
      peticionJson('PUT', { url: 'https://api.qa.example.com', token: TOKEN }),
    );
    expect(res.status).toBe(200);
    const urlEscrita = repo.guardados.find((g) => g.clave === CLAVE_CONFIG_APIFACTURACION_URL);
    const tokenEscrito = repo.guardados.find((g) => g.clave === CLAVE_CONFIG_APIFACTURACION_TOKEN);
    expect(urlEscrita).toMatchObject({ valor: 'https://api.qa.example.com', esSecreto: false });
    expect(tokenEscrito).toMatchObject({ usuario: 'Scott Palomino', esSecreto: true });
    expect(tokenEscrito?.valor).not.toContain(TOKEN);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.configuracion.configurado).toBe(true);
  });

  it('token null elimina la clave', async () => {
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto(TOKEN, ENV_TEST), true));
    const res = await PUT(peticionJson('PUT', { token: null }));
    expect(res.status).toBe(200);
    expect(repo.eliminados).toEqual([
      { clave: CLAVE_CONFIG_APIFACTURACION_TOKEN, usuario: 'Scott Palomino' },
    ]);
    const json = await res.json();
    expect(json.configuracion.configurado).toBe(false);
  });

  it('token vacío mantiene el actual (sin escribir ni eliminar el token)', async () => {
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto(TOKEN, ENV_TEST), true));
    const res = await PUT(peticionJson('PUT', { token: '' }));
    expect(res.status).toBe(200);
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('url inválida responde 400 y no escribe nada', async () => {
    const res = await PUT(peticionJson('PUT', { url: 'casi-url' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('token solo espacios responde 400 y no escribe nada', async () => {
    const res = await PUT(peticionJson('PUT', { token: '   ' }));
    expect(res.status).toBe(400);
    expect(repo.guardados).toEqual([]);
  });

  it('campo desconocido responde 400 (superficie estricta, patrón E5)', async () => {
    const res = await PUT(peticionJson('PUT', { hacking: true }));
    expect(res.status).toBe(400);
    expect(repo.guardados).toEqual([]);
  });

  it('cuerpo no-JSON responde 400', async () => {
    const request = new Request('http://localhost:3000/api/crm/configuracion/apifacturacion', {
      method: 'PUT',
      body: 'no-json',
    });
    const res = await PUT(request);
    expect(res.status).toBe(400);
  });

  it('escritura de secreto sin CRM_CONFIG_KEY responde 503 sin escribir nada', async () => {
    delete process.env.CRM_CONFIG_KEY;
    const res = await PUT(peticionJson('PUT', { token: TOKEN }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('sin sesión responde 401; sin permiso responde 403 (nada escrito)', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await PUT(peticionJson('PUT', { url: 'https://x.example.com' }))).status).toBe(401);

    mocks.getSession.mockResolvedValue(SESION_SIN_PERMISO);
    expect((await PUT(peticionJson('PUT', { url: 'https://x.example.com' }))).status).toBe(403);
    expect(repo.guardados).toEqual([]);
  });
});

describe('POST /api/crm/configuracion/apifacturacion/probar', () => {
  let repo: FakeConfig;

  beforeEach(() => {
    process.env.CRM_CONFIG_KEY = CLAVE_TEST;
    repo = new FakeConfig();
    mocks.getCrmConfigRepository.mockResolvedValue(repo);
    mocks.getSession.mockResolvedValue(SESION);
  });

  afterEach(() => {
    if (CLAVE_ORIGINAL === undefined) delete process.env.CRM_CONFIG_KEY;
    else process.env.CRM_CONFIG_KEY = CLAVE_ORIGINAL;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('ejecuta UNA consulta real contra la API y devuelve { ok, mensaje }', async () => {
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto(TOKEN, ENV_TEST), true));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ razon_social: 'CONSTRUCTORES ANDINA S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ok).toBe(true);
    expect(json.mensaje).toContain('CONSTRUCTORES ANDINA S.A.C.');
    expect(JSON.stringify(json)).not.toContain(TOKEN);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.apifacturacion.com/ruc/20525426778');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin token configurado responde 200 con ok false y mensaje claro', async () => {
    const original = process.env.APIFACTURACION_TOKEN;
    delete process.env.APIFACTURACION_TOKEN;
    try {
      const res = await POST();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.mensaje).toContain('no está configurado');
    } finally {
      if (original !== undefined) process.env.APIFACTURACION_TOKEN = original;
    }
  });

  it('un token rechazado por la API produce ok false sin filtrar el token', async () => {
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto(TOKEN, ENV_TEST), true));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    const res = await POST();
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(JSON.stringify(json)).not.toContain(TOKEN);
  });

  it('sin sesión responde 401 sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
