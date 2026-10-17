import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntradaConfigCrm } from '../../domain/entities';
import type { CambioConfig, EliminarConfigInput } from '../../domain/ports';
import { descifrarSecreto } from '../../infrastructure/config/cifradoSecretos';
import {
  CLAVES_CONFIG_CANAL_KAPSO,
  ErrorConfigCanalInvalida,
  GuardarConfigCanalKapsoUseCase,
  generarWebhookSecret,
  leerVistaCanalKapso,
  probarKapso,
  resolverConfigCanalKapso,
  type ConfigCanalKapso,
} from '../configCanalKapso';

const CLAVE = 'a'.repeat(64);
const ENV_CON_CLAVE = { CRM_CONFIG_KEY: CLAVE };
const API_KEY = 'kapso-api-key-super-secreta-1234';

class FakeConfig {
  filas = new Map<string, EntradaConfigCrm>();
  lotes: CambioConfig[][] = [];
  eliminados: string[] = [];
  fallo: Error | null = null;

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    if (this.fallo) throw this.fallo;
    return [...this.filas.values()].filter((fila) => fila.clave.startsWith(prefijo));
  }

  async guardarVarios(cambios: CambioConfig[], usuario: string): Promise<void> {
    this.lotes.push(cambios);
    for (const cambio of cambios) {
      this.filas.set(cambio.clave, { ...cambio, actualizadoPor: usuario, actualizadoEn: new Date() });
    }
  }

  async eliminar(input: EliminarConfigInput): Promise<void> {
    this.eliminados.push(input.clave);
    this.filas.delete(input.clave);
  }
}

let config: FakeConfig;
let warn: ReturnType<typeof vi.spyOn>;

function useCase(env: Record<string, string | undefined> = ENV_CON_CLAVE): GuardarConfigCanalKapsoUseCase {
  return new GuardarConfigCanalKapsoUseCase({ config, env });
}

beforeEach(() => {
  config = new FakeConfig();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GuardarConfigCanalKapsoUseCase — validación', () => {
  const invalidos: Array<[string, Parameters<GuardarConfigCanalKapsoUseCase['guardar']>[0]]> = [
    ['modo', { modo: 'otro' as unknown as 'real' }],
    ['phoneNumberId', { phoneNumberId: '12ab' }],
    ['phoneNumberId', { phoneNumberId: '1234' }],
    ['phoneNumberId', { phoneNumberId: '1'.repeat(33) }],
    ['timeoutMs', { timeoutMs: 999 }],
    ['timeoutMs', { timeoutMs: 60001 }],
    ['timeoutMs', { timeoutMs: 2500.5 }],
    ['apiKey', { apiKey: '   ' }],
    ['apiKey', { apiKey: 'x'.repeat(501) }],
    ['webhookSecret', { webhookSecret: 5 as unknown as string }],
  ];

  it.each(invalidos)('rechaza %s inválido antes de escribir nada', async (campo, cambios) => {
    const intento = useCase().guardar({ modo: 'real', ...cambios }, 'admin');

    await expect(intento).rejects.toBeInstanceOf(ErrorConfigCanalInvalida);
    await expect(intento).rejects.toMatchObject({ campo });
    expect(config.lotes).toEqual([]);
  });
});

describe('GuardarConfigCanalKapsoUseCase — persistencia', () => {
  it('cifra los secretos en reposo y los marca esSecreto en UN solo lote', async () => {
    await useCase().guardar(
      { modo: 'real', phoneNumberId: ' 123456789 ', timeoutMs: 8000, apiKey: ` ${API_KEY} ` },
      'maria',
    );

    expect(config.lotes).toHaveLength(1);
    const porClave = new Map(config.lotes[0].map((cambio) => [cambio.clave, cambio]));
    expect(porClave.get(CLAVES_CONFIG_CANAL_KAPSO.modo)).toMatchObject({ valor: 'real', esSecreto: false });
    expect(porClave.get(CLAVES_CONFIG_CANAL_KAPSO.phoneNumberId)?.valor).toBe('123456789');
    expect(porClave.get(CLAVES_CONFIG_CANAL_KAPSO.timeoutMs)?.valor).toBe('8000');
    const cifrada = porClave.get(CLAVES_CONFIG_CANAL_KAPSO.apiKey);
    expect(cifrada?.esSecreto).toBe(true);
    expect(cifrada?.valor).not.toBe(API_KEY);
    expect(cifrada?.valor).not.toContain(API_KEY);
    expect(descifrarSecreto(cifrada?.valor ?? '', ENV_CON_CLAVE)).toBe(API_KEY);
  });

  it("secreto '' u omitido = mantener; null = eliminar", async () => {
    await useCase().guardar({ apiKey: API_KEY, webhookSecret: 'wh-secreto-original' }, 'maria');
    const previo = config.filas.get(CLAVES_CONFIG_CANAL_KAPSO.apiKey)?.valor;
    config.lotes = [];

    await useCase().guardar({ modo: 'simulado', apiKey: '' }, 'maria');
    expect(config.filas.get(CLAVES_CONFIG_CANAL_KAPSO.apiKey)?.valor).toBe(previo);
    expect(config.lotes[0].map((c) => c.clave)).toEqual([CLAVES_CONFIG_CANAL_KAPSO.modo]);

    await useCase().guardar({ webhookSecret: null }, 'maria');
    expect(config.eliminados).toEqual([CLAVES_CONFIG_CANAL_KAPSO.webhookSecret]);
    expect(config.filas.has(CLAVES_CONFIG_CANAL_KAPSO.webhookSecret)).toBe(false);
    expect(config.filas.has(CLAVES_CONFIG_CANAL_KAPSO.apiKey)).toBe(true);
  });

  it('sin CRM_CONFIG_KEY un secreto falla con CLAVE_NO_CONFIGURADA y no escribe nada', async () => {
    await expect(
      useCase({}).guardar({ modo: 'real', apiKey: API_KEY }, 'maria'),
    ).rejects.toMatchObject({ codigo: 'CLAVE_NO_CONFIGURADA' });
    expect(config.lotes).toEqual([]);
  });

  it('regenerarWebhookSecret guarda cifrado y devuelve el texto plano una sola vez', async () => {
    const resultado = await useCase().guardar({ regenerarWebhookSecret: true }, 'maria');

    expect(resultado.webhookSecretGenerado).toMatch(/^[0-9a-f]{64}$/);
    const guardada = config.filas.get(CLAVES_CONFIG_CANAL_KAPSO.webhookSecret);
    expect(guardada?.esSecreto).toBe(true);
    expect(guardada?.valor).not.toContain(resultado.webhookSecretGenerado ?? '#');
    expect(descifrarSecreto(guardada?.valor ?? '', ENV_CON_CLAVE)).toBe(resultado.webhookSecretGenerado);

    const vista = await leerVistaCanalKapso({ config }, ENV_CON_CLAVE);
    expect(JSON.stringify(vista)).not.toContain(resultado.webhookSecretGenerado ?? '#');
  });

  it('generarWebhookSecret produce 32 bytes hex distintos', () => {
    expect(generarWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
    expect(generarWebhookSecret()).not.toBe(generarWebhookSecret());
  });
});

describe('resolverConfigCanalKapso / leerVistaCanalKapso', () => {
  it('DB gana sobre env, con secretos descifrados', async () => {
    await useCase().guardar({ modo: 'real', phoneNumberId: '555555', apiKey: API_KEY }, 'maria');
    const env = {
      ...ENV_CON_CLAVE,
      KAPSO_MODO: 'simulado',
      KAPSO_API_KEY: 'env-key',
      KAPSO_PHONE_NUMBER_ID: '999999',
      KAPSO_TIMEOUT_MS: '9000',
    };

    const efectiva = await resolverConfigCanalKapso({ config }, env);

    expect(efectiva).toMatchObject({
      modo: 'real',
      apiKey: API_KEY,
      phoneNumberId: '555555',
      timeoutMs: 9000,
    });
  });

  it('cae a env por clave y a defaults sin nada', async () => {
    const env = { KAPSO_API_KEY: 'env-key', KAPSO_WEBHOOK_SECRET: 'env-wh' };
    expect(await resolverConfigCanalKapso({ config }, env)).toEqual({
      modo: null,
      apiKey: 'env-key',
      phoneNumberId: null,
      webhookSecret: 'env-wh',
      timeoutMs: 15000,
    });
  });

  it('fallo de DB o secreto ilegible → env, con warn que solo lleva el CÓDIGO', async () => {
    config.fallo = new Error('conexión con password=hunter2');
    const sinDb = await resolverConfigCanalKapso({ config }, { KAPSO_API_KEY: 'env-key' });
    expect(sinDb.apiKey).toBe('env-key');

    config.fallo = null;
    config.filas.set(CLAVES_CONFIG_CANAL_KAPSO.apiKey, {
      clave: CLAVES_CONFIG_CANAL_KAPSO.apiKey,
      valor: 'v1:basura',
      esSecreto: true,
      actualizadoPor: 'x',
      actualizadoEn: new Date(),
    });
    const ilegible = await resolverConfigCanalKapso(
      { config },
      { ...ENV_CON_CLAVE, KAPSO_API_KEY: 'env-key' },
    );
    expect(ilegible.apiKey).toBe('env-key');

    const registrado = JSON.stringify(warn.mock.calls);
    expect(registrado).not.toContain('hunter2');
    expect(registrado).not.toContain('v1:basura');
    expect(registrado).toContain('FORMATO_INVALIDO');
  });

  it('la vista nunca expone secretos: solo configurado + máscara, y fuentes', async () => {
    await useCase().guardar({ phoneNumberId: '123456', apiKey: API_KEY }, 'maria');

    const vista = await leerVistaCanalKapso({ config }, { ...ENV_CON_CLAVE, KAPSO_MODO: 'real' });

    expect(vista.config.apiKey).toEqual({ configurado: true, mascara: '••••••••1234' });
    expect(vista.config.webhookSecret).toEqual({ configurado: false, mascara: '' });
    expect(vista.fuentes).toMatchObject({
      apiKey: 'db',
      phoneNumberId: 'db',
      modo: 'env',
      webhookSecret: 'default',
      timeoutMs: 'default',
    });
    const texto = JSON.stringify(vista);
    expect(texto).not.toContain(API_KEY);
    expect(texto).not.toContain('v1:');
  });

  it('secreto ilegible → configurado true, máscara vacía, ilegible true (también sin clave)', async () => {
    await useCase().guardar({ apiKey: API_KEY }, 'maria');

    const vista = await leerVistaCanalKapso({ config }, {});

    expect(vista.config.apiKey).toEqual({ configurado: true, mascara: '', ilegible: true });
    expect(vista.fuentes.apiKey).toBe('db');
  });
});

describe('probarKapso', () => {
  const base: ConfigCanalKapso = {
    modo: 'real',
    apiKey: API_KEY,
    phoneNumberId: '123456',
    webhookSecret: null,
    timeoutMs: 15000,
  };

  function respuesta(status: number, cuerpo: unknown): Response {
    return new Response(JSON.stringify(cuerpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('modo simulado: ok sin contactar a Kapso', async () => {
    const fetchFalso = vi.fn();
    expect(await probarKapso({ ...base, modo: 'simulado' }, { fetch: fetchFalso })).toEqual({
      ok: true,
      detalle: 'Modo simulado: no se contacta a Kapso',
    });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('falta apiKey o phoneNumberId → no ok sin red', async () => {
    const fetchFalso = vi.fn();
    expect((await probarKapso({ ...base, apiKey: null }, { fetch: fetchFalso })).ok).toBe(false);
    expect((await probarKapso({ ...base, phoneNumberId: null }, { fetch: fetchFalso })).ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('200 → ok, usando la API key por X-API-Key contra el proxy de Kapso', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuesta(200, { calling: {} }));

    const resultado = await probarKapso(base, { fetch: fetchFalso });

    expect(resultado.ok).toBe(true);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.kapso.ai/meta/whatsapp');
    expect(url).toContain('123456/settings');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe(API_KEY);
    expect(resultado.detalle).not.toContain(API_KEY);
  });

  it('401 del proveedor → mensaje genérico sin secreto ni cuerpo crudo', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respuesta(401, { error: { message: `bad key ${API_KEY} RAW-PROVIDER-BODY` } }));

    const resultado = await probarKapso(base, { fetch: fetchFalso });

    expect(resultado.ok).toBe(false);
    expect(resultado.detalle).toBe('Kapso rechazó las credenciales (revisá la API key)');
    expect(JSON.stringify(resultado)).not.toContain('RAW-PROVIDER-BODY');
    expect(JSON.stringify(resultado)).not.toContain(API_KEY);
  });

  it('timeout duro → no ok', async () => {
    const fetchColgado = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );

    const resultado = await probarKapso(base, { fetch: fetchColgado, timeoutMs: 20 });

    expect(resultado).toEqual({ ok: false, detalle: 'Kapso no respondió a tiempo' });
  });

  it('fallo de red → mensaje genérico', async () => {
    const fetchFalso = vi.fn().mockRejectedValue(new Error(`ECONNREFUSED ${API_KEY}`));
    const resultado = await probarKapso(base, { fetch: fetchFalso });
    expect(resultado.ok).toBe(false);
    expect(JSON.stringify(resultado)).not.toContain(API_KEY);
  });
});
