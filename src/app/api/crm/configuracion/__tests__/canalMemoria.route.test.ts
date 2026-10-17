// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntradaConfigCrm } from '@/features/crm/domain/entities';
import type {
  CambioConfig,
  ConfigCrmRepository,
  EliminarConfigInput,
  GuardarConfigInput,
} from '@/features/crm/domain/ports';
import { descifrarSecreto } from '@/features/crm/infrastructure/config/cifradoSecretos';
import { __setCrmDbForTests, type CrmDb } from '@/features/crm/infrastructure/getCrmDb';

/**
 * Route contract for /api/crm/configuracion/{canal,canal/probar,memoria,
 * memoria/probar} (agente-ia-crm E5·T5a). Use cases are the REAL ones;
 * only the ConfigCrmRepository port and global fetch are fakes.
 */

const mocks = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock('@/lib/auth', () => ({ getSession: mocks.getSessionMock }));

import { GET as getCanal, PUT as putCanal } from '../canal/route';
import { POST as probarCanal } from '../canal/probar/route';
import { GET as getMemoria, PUT as putMemoria } from '../memoria/route';
import { POST as probarMemoria } from '../memoria/probar/route';

const CLAVE_CIFRADO = 'c'.repeat(64);
const API_KEY = 'kapso-api-key-secretisima-4321';
const TOKEN = 'engram-token-secretisimo-8765';

class FakeConfig implements ConfigCrmRepository {
  filas = new Map<string, EntradaConfigCrm>();
  lotes: CambioConfig[][] = [];
  falloEnGuardar: Error | null = null;

  async obtener(clave: string): Promise<EntradaConfigCrm | null> {
    return this.filas.get(clave) ?? null;
  }

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    return [...this.filas.values()].filter((fila) => fila.clave.startsWith(prefijo));
  }

  async guardar(input: GuardarConfigInput): Promise<void> {
    await this.guardarVarios([input], input.usuario);
  }

  async guardarVarios(cambios: CambioConfig[], usuario: string): Promise<void> {
    if (this.falloEnGuardar) throw this.falloEnGuardar;
    this.lotes.push(cambios);
    for (const cambio of cambios) {
      this.filas.set(cambio.clave, { ...cambio, actualizadoPor: usuario, actualizadoEn: new Date() });
    }
  }

  async eliminar(input: EliminarConfigInput): Promise<void> {
    this.filas.delete(input.clave);
  }

  async listarAuditoria(): Promise<[]> {
    return [];
  }
}

function setDb(config: ConfigCrmRepository | undefined): void {
  __setCrmDbForTests({
    pool: {} as CrmDb['pool'],
    ...(config ? { config } : {}),
  } as unknown as CrmDb);
}

const sessionBase = { sub: 'u-1', nombre: 'Juana Perez', area: 'sistemas' };

function put(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const URL_CANAL = 'http://localhost/api/crm/configuracion/canal';
const URL_MEMORIA = 'http://localhost/api/crm/configuracion/memoria';

let config: FakeConfig;
let consola: Array<ReturnType<typeof vi.spyOn>>;

function todaLaConsola(): string {
  return JSON.stringify(consola.flatMap((espia) => espia.mock.calls));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRM_CONFIG_KEY', CLAVE_CIFRADO);
  for (const nombre of [
    'KAPSO_MODO',
    'KAPSO_API_KEY',
    'KAPSO_PHONE_NUMBER_ID',
    'KAPSO_WEBHOOK_SECRET',
    'KAPSO_TIMEOUT_MS',
    'ENGRAM_CRM_URL',
    'ENGRAM_CRM_TOKEN',
    'ENGRAM_CRM_TIMEOUT_MS',
  ]) {
    vi.stubEnv(nombre, '');
  }
  mocks.getSessionMock.mockResolvedValue({ ...sessionBase, permisos: ['crm_configuracion'] });
  config = new FakeConfig();
  setDb(config);
  consola = [
    vi.spyOn(console, 'log').mockImplementation(() => {}),
    vi.spyOn(console, 'warn').mockImplementation(() => {}),
    vi.spyOn(console, 'error').mockImplementation(() => {}),
    vi.spyOn(console, 'info').mockImplementation(() => {}),
  ];
});

afterEach(() => {
  __setCrmDbForTests(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  ['canal', getCanal, putCanal, URL_CANAL, { modo: 'simulado' }],
  ['memoria', getMemoria, putMemoria, URL_MEMORIA, { retencionMeses: 6 }],
] as const)('gates de /configuracion/%s', (_nombre, get, putHandler, url, cuerpoValido) => {
  it('GET 401 / 403 / 503', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await get()).status).toBe(403);
    setDb(undefined);
    expect((await get()).status).toBe(503);
  });

  it('PUT 401 / 403 / 503 sin escribir', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await putHandler(put(url, cuerpoValido))).status).toBe(401);
    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await putHandler(put(url, cuerpoValido))).status).toBe(403);
    setDb(undefined);
    expect((await putHandler(put(url, cuerpoValido))).status).toBe(503);
    expect(config.lotes).toEqual([]);
  });

  it('PUT 400 con JSON malformado, no objeto, vacío o claves desconocidas', async () => {
    for (const cuerpo of ['{no', [1], {}, { desconocido: 1 }]) {
      expect((await putHandler(put(url, cuerpo))).status).toBe(400);
    }
    expect(config.lotes).toEqual([]);
  });

  it('PUT 500 sin filtrar el mensaje interno', async () => {
    config.falloEnGuardar = new Error('conexión secreta rota');
    const respuesta = await putHandler(put(url, cuerpoValido));
    expect(respuesta.status).toBe(500);
    expect(JSON.stringify(await respuesta.json())).not.toContain('secreta');
  });
});

describe('/configuracion/canal', () => {
  it('GET 200 no-store con secretos solo enmascarados', async () => {
    vi.stubEnv('KAPSO_WEBHOOK_SECRET', 'env-webhook-secret-12345');

    const respuesta = await getCanal();
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    const cuerpo = JSON.parse(texto);
    expect(cuerpo.config.webhookSecret).toEqual({ configurado: true, mascara: '••••••••2345' });
    expect(cuerpo.config.apiKey).toEqual({ configurado: false, mascara: '' });
    expect(texto).not.toContain('env-webhook-secret');
  });

  it('PUT 200 persiste cifrado, usa el usuario de sesión y nunca devuelve el secreto', async () => {
    const respuesta = await putCanal(
      put(URL_CANAL, { modo: 'real', phoneNumberId: '123456', apiKey: API_KEY }),
    );
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(texto).not.toContain(API_KEY);
    expect(JSON.parse(texto).config.apiKey).toEqual({ configurado: true, mascara: '••••••••4321' });
    expect(config.lotes).toHaveLength(1);
    const guardada = config.filas.get('canal.kapso.apiKey');
    expect(guardada?.actualizadoPor).toBe('Juana Perez');
    expect(guardada?.esSecreto).toBe(true);
    expect(guardada?.valor).not.toContain(API_KEY);
    expect(descifrarSecreto(guardada?.valor ?? '', { CRM_CONFIG_KEY: CLAVE_CIFRADO })).toBe(API_KEY);
    expect(todaLaConsola()).not.toContain(API_KEY);
  });

  it('PUT 400 {campo} con un valor inválido y nada escrito', async () => {
    const respuesta = await putCanal(put(URL_CANAL, { modo: 'real', phoneNumberId: 'abc' }));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(400);
    expect(cuerpo.campo).toBe('phoneNumberId');
    expect(config.lotes).toEqual([]);
  });

  it('PUT 400 con accion desconocida', async () => {
    expect((await putCanal(put(URL_CANAL, { accion: 'borrarTodo' }))).status).toBe(400);
  });

  it('PUT con un secreto y sin CRM_CONFIG_KEY → 503 CLAVE_NO_CONFIGURADA sin escribir', async () => {
    vi.stubEnv('CRM_CONFIG_KEY', '');

    const respuesta = await putCanal(put(URL_CANAL, { modo: 'real', apiKey: API_KEY }));
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(503);
    expect(JSON.parse(texto)).toMatchObject({ code: 'CLAVE_NO_CONFIGURADA' });
    expect(texto).not.toContain(API_KEY);
    expect(config.lotes).toEqual([]);
  });

  it('sin CRM_CONFIG_KEY el GET funciona y marca el secreto como ilegible', async () => {
    await putCanal(put(URL_CANAL, { apiKey: API_KEY }));
    vi.stubEnv('CRM_CONFIG_KEY', '');

    const respuesta = await getCanal();

    expect(respuesta.status).toBe(200);
    expect((await respuesta.json()).config.apiKey).toEqual({
      configurado: true,
      mascara: '',
      ilegible: true,
    });
  });

  it('regenerarWebhookSecret devuelve el texto plano UNA vez y jamás en GET ni en PUT posteriores', async () => {
    const respuesta = await putCanal(put(URL_CANAL, { accion: 'regenerarWebhookSecret' }));
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.webhookSecretGenerado).toMatch(/^[0-9a-f]{64}$/);
    expect(cuerpo.config.webhookSecret.configurado).toBe(true);
    const guardada = config.filas.get('canal.kapso.webhookSecret');
    expect(guardada?.valor).not.toContain(cuerpo.webhookSecretGenerado);
    expect(guardada?.esSecreto).toBe(true);

    const lectura = await (await getCanal()).text();
    expect(lectura).not.toContain(cuerpo.webhookSecretGenerado);
    const otroPut = await (await putCanal(put(URL_CANAL, { modo: 'real' }))).text();
    expect(otroPut).not.toContain(cuerpo.webhookSecretGenerado);
    expect(todaLaConsola()).not.toContain(cuerpo.webhookSecretGenerado);
  });

  it('regenerar junto con webhookSecret explícito → 400', async () => {
    const respuesta = await putCanal(
      put(URL_CANAL, { accion: 'regenerarWebhookSecret', webhookSecret: 'x-manual' }),
    );
    expect(respuesta.status).toBe(400);
    expect(config.lotes).toEqual([]);
  });
});

describe('POST /configuracion/canal/probar', () => {
  it('401 / 403 / 503', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await probarCanal()).status).toBe(401);
    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await probarCanal()).status).toBe(403);
    setDb(undefined);
    expect((await probarCanal()).status).toBe(503);
  });

  it('modo simulado → ok sin tocar la red', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);
    await putCanal(put(URL_CANAL, { modo: 'simulado' }));

    const respuesta = await probarCanal();

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      success: true,
      ok: true,
      detalle: 'Modo simulado: no se contacta a Kapso',
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('usa la config resuelta (secreto descifrado) y mapea 401 a mensaje genérico', async () => {
    await putCanal(put(URL_CANAL, { modo: 'real', phoneNumberId: '123456', apiKey: API_KEY }));
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: `RAW ${API_KEY}` } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const respuesta = await probarCanal();
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(JSON.parse(texto)).toMatchObject({ ok: false });
    expect(texto).not.toContain(API_KEY);
    expect(texto).not.toContain('RAW');
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe(API_KEY);
    expect(todaLaConsola()).not.toContain(API_KEY);
  });
});

describe('/configuracion/memoria', () => {
  it('GET 200 no-store con valores por defecto', async () => {
    const respuesta = await getMemoria();
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(cuerpo.config).toMatchObject({ url: null, retencionMeses: 12, timeoutMs: 5000 });
    expect(cuerpo.config.token).toEqual({ configurado: false, mascara: '' });
  });

  it('PUT 200 cifra el token y no lo devuelve', async () => {
    const respuesta = await putMemoria(
      put(URL_MEMORIA, { url: 'http://localhost:7437', token: TOKEN, retencionMeses: 24 }),
    );
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(texto).not.toContain(TOKEN);
    expect(JSON.parse(texto).config).toMatchObject({
      url: 'http://localhost:7437',
      retencionMeses: 24,
      token: { configurado: true, mascara: '••••••••8765' },
    });
    const guardado = config.filas.get('memoria.token');
    expect(guardado?.valor).not.toContain(TOKEN);
    expect(descifrarSecreto(guardado?.valor ?? '', { CRM_CONFIG_KEY: CLAVE_CIFRADO })).toBe(TOKEN);
    expect(todaLaConsola()).not.toContain(TOKEN);
  });

  it('PUT 400 {campo} para URL con credenciales y retención fuera de rango', async () => {
    const conCredenciales = await putMemoria(put(URL_MEMORIA, { url: 'http://u:p@host' }));
    expect(conCredenciales.status).toBe(400);
    expect((await conCredenciales.json()).campo).toBe('url');

    const retencion = await putMemoria(put(URL_MEMORIA, { retencionMeses: 121 }));
    expect(retencion.status).toBe(400);
    expect((await retencion.json()).campo).toBe('retencionMeses');
    expect(config.lotes).toEqual([]);
  });

  it('PUT del token sin CRM_CONFIG_KEY → 503 CLAVE_NO_CONFIGURADA sin escribir; sin token sigue funcionando', async () => {
    vi.stubEnv('CRM_CONFIG_KEY', '');

    const respuesta = await putMemoria(put(URL_MEMORIA, { token: TOKEN }));
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toMatchObject({ code: 'CLAVE_NO_CONFIGURADA' });
    expect(config.lotes).toEqual([]);

    expect((await putMemoria(put(URL_MEMORIA, { retencionMeses: 6 }))).status).toBe(200);
  });
});

describe('POST /configuracion/memoria/probar', () => {
  it('401 / 403 / 503', async () => {
    mocks.getSessionMock.mockResolvedValueOnce(null);
    expect((await probarMemoria()).status).toBe(401);
    mocks.getSessionMock.mockResolvedValueOnce({ ...sessionBase, permisos: ['crm'] });
    expect((await probarMemoria()).status).toBe(403);
    setDb(undefined);
    expect((await probarMemoria()).status).toBe(503);
  });

  it('sin URL → ok:false sin red; con URL y fetch inyectado → ok', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response('{"context":""}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);

    const sinUrl = await probarMemoria();
    expect((await sinUrl.json()).ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();

    await putMemoria(put(URL_MEMORIA, { url: 'http://localhost:7437', token: TOKEN }));
    const conUrl = await probarMemoria();
    const texto = await conUrl.text();
    expect(JSON.parse(texto)).toMatchObject({ success: true, ok: true });
    expect(texto).not.toContain(TOKEN);
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('401 del proveedor → mensaje genérico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`RAW ${TOKEN}`, { status: 401 })));
    await putMemoria(put(URL_MEMORIA, { url: 'http://localhost:7437', token: TOKEN }));

    const texto = await (await probarMemoria()).text();

    expect(JSON.parse(texto)).toMatchObject({ ok: false });
    expect(texto).not.toContain(TOKEN);
    expect(texto).not.toContain('RAW');
  });
});
