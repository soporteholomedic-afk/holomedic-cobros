import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntradaConfigCrm } from '../../domain/entities';
import type { CambioConfig, EliminarConfigInput } from '../../domain/ports';
import { descifrarSecreto } from '../../infrastructure/config/cifradoSecretos';
import {
  CLAVES_CONFIG_MEMORIA,
  ErrorConfigMemoriaInvalida,
  GuardarConfigMemoriaUseCase,
  leerVistaMemoria,
  probarMemoria,
  resolverConfigMemoria,
  type ConfigMemoria,
} from '../configMemoria';

const ENV_CON_CLAVE = { CRM_CONFIG_KEY: 'b'.repeat(64) };
const TOKEN = 'engram-token-super-secreto-9876';

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

function useCase(env: Record<string, string | undefined> = ENV_CON_CLAVE): GuardarConfigMemoriaUseCase {
  return new GuardarConfigMemoriaUseCase({ config, env });
}

beforeEach(() => {
  config = new FakeConfig();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GuardarConfigMemoriaUseCase — validación', () => {
  const invalidos: Array<[string, Parameters<GuardarConfigMemoriaUseCase['guardar']>[0]]> = [
    ['url', { url: 'ftp://engram.local' }],
    ['url', { url: 'no es una url' }],
    ['url', { url: 'https://user:pass@engram.local' }],
    ['url', { url: '   ' }],
    ['timeoutMs', { timeoutMs: 500 }],
    ['timeoutMs', { timeoutMs: 70000 }],
    ['retencionMeses', { retencionMeses: 0 }],
    ['retencionMeses', { retencionMeses: 121 }],
    ['retencionMeses', { retencionMeses: 6.5 }],
    ['token', { token: '   ' }],
    ['token', { token: 't'.repeat(501) }],
  ];

  it.each(invalidos)('rechaza %s inválido antes de escribir', async (campo, cambios) => {
    const intento = useCase().guardar({ retencionMeses: 6, ...cambios }, 'admin');

    await expect(intento).rejects.toBeInstanceOf(ErrorConfigMemoriaInvalida);
    await expect(intento).rejects.toMatchObject({ campo });
    expect(config.lotes).toEqual([]);
  });
});

describe('GuardarConfigMemoriaUseCase — persistencia', () => {
  it('guarda en un lote y cifra el token en reposo', async () => {
    await useCase().guardar(
      { url: ' http://localhost:7437/ ', timeoutMs: 4000, retencionMeses: 24, token: TOKEN },
      'maria',
    );

    expect(config.lotes).toHaveLength(1);
    const porClave = new Map(config.lotes[0].map((c) => [c.clave, c]));
    expect(porClave.get(CLAVES_CONFIG_MEMORIA.url)).toMatchObject({
      valor: 'http://localhost:7437/',
      esSecreto: false,
    });
    expect(porClave.get(CLAVES_CONFIG_MEMORIA.retencionMeses)?.valor).toBe('24');
    const token = porClave.get(CLAVES_CONFIG_MEMORIA.token);
    expect(token?.esSecreto).toBe(true);
    expect(token?.valor).not.toContain(TOKEN);
    expect(descifrarSecreto(token?.valor ?? '', ENV_CON_CLAVE)).toBe(TOKEN);
  });

  it("token '' mantiene y null elimina", async () => {
    await useCase().guardar({ token: TOKEN }, 'maria');
    const previo = config.filas.get(CLAVES_CONFIG_MEMORIA.token)?.valor;

    await useCase().guardar({ retencionMeses: 3, token: '' }, 'maria');
    expect(config.filas.get(CLAVES_CONFIG_MEMORIA.token)?.valor).toBe(previo);

    await useCase().guardar({ token: null }, 'maria');
    expect(config.eliminados).toEqual([CLAVES_CONFIG_MEMORIA.token]);
  });

  it('sin CRM_CONFIG_KEY el token falla y no escribe nada', async () => {
    await expect(
      useCase({}).guardar({ retencionMeses: 3, token: TOKEN }, 'maria'),
    ).rejects.toMatchObject({ codigo: 'CLAVE_NO_CONFIGURADA' });
    expect(config.lotes).toEqual([]);
  });
});

describe('resolverConfigMemoria / leerVistaMemoria', () => {
  it('DB sobre env, env de respaldo y retención por defecto 12', async () => {
    expect(await resolverConfigMemoria({ config }, { ENGRAM_CRM_URL: 'http://env:1', ENGRAM_CRM_TOKEN: 'env-t' }))
      .toEqual({ url: 'http://env:1', token: 'env-t', timeoutMs: 5000, retencionMeses: 12 });

    await useCase().guardar({ url: 'http://db:2', token: TOKEN, retencionMeses: 6 }, 'maria');
    const efectiva = await resolverConfigMemoria(
      { config },
      { ...ENV_CON_CLAVE, ENGRAM_CRM_URL: 'http://env:1', ENGRAM_CRM_TOKEN: 'env-t' },
    );
    expect(efectiva).toMatchObject({ url: 'http://db:2', token: TOKEN, retencionMeses: 6 });
  });

  it('fallo de DB → env', async () => {
    config.fallo = new Error('boom');
    const efectiva = await resolverConfigMemoria({ config }, { ENGRAM_CRM_URL: 'http://env:1' });
    expect(efectiva.url).toBe('http://env:1');
  });

  it('vista: token solo configurado+máscara, fuentes por clave, ilegible sin clave', async () => {
    await useCase().guardar({ url: 'http://db:2', token: TOKEN }, 'maria');

    const vista = await leerVistaMemoria({ config }, ENV_CON_CLAVE);
    expect(vista.config.token).toEqual({ configurado: true, mascara: '••••••••9876' });
    expect(vista.fuentes).toMatchObject({ url: 'db', token: 'db', retencionMeses: 'default' });
    expect(JSON.stringify(vista)).not.toContain(TOKEN);

    const sinClave = await leerVistaMemoria({ config }, {});
    expect(sinClave.config.token).toEqual({ configurado: true, mascara: '', ilegible: true });
  });
});

describe('probarMemoria', () => {
  const base: ConfigMemoria = { url: 'http://engram.local:7437/', token: TOKEN, timeoutMs: 5000, retencionMeses: 12 };

  it('sin URL → no ok sin red', async () => {
    const fetchFalso = vi.fn();
    expect((await probarMemoria({ ...base, url: null }, { fetch: fetchFalso })).ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('200 → ok, GET /context con Bearer', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response('{"context":""}', { status: 200 }));
    const resultado = await probarMemoria(base, { fetch: fetchFalso });
    expect(resultado.ok).toBe(true);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://engram.local:7437/context?project=crm-probe');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
  });

  it('404 unknown_project cuenta como alcanzable; otro 404 no', async () => {
    const vacio = vi.fn().mockResolvedValue(new Response('{"code":"unknown_project"}', { status: 404 }));
    expect((await probarMemoria(base, { fetch: vacio })).ok).toBe(true);
    const otro = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    expect((await probarMemoria(base, { fetch: otro })).ok).toBe(false);
  });

  it('401 → mensaje genérico sin cuerpo crudo', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response(`RAW-BODY ${TOKEN}`, { status: 401 }));
    const resultado = await probarMemoria(base, { fetch: fetchFalso });
    expect(resultado).toEqual({ ok: false, detalle: 'Engram rechazó las credenciales (revisá el token)' });
  });

  it('timeout duro → no ok', async () => {
    const colgado = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    expect(await probarMemoria(base, { fetch: colgado, timeoutMs: 20 })).toEqual({
      ok: false,
      detalle: 'Engram no respondió a tiempo',
    });
  });
});
