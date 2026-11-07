// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import type { EntradaConfigCrm } from '@/features/crm/domain/entities';
import type {
  ConfigCrmRepository,
  EliminarConfigInput,
  GuardarConfigInput,
} from '@/features/crm/domain/ports';
import { cifrarSecreto, descifrarSecreto } from '@/features/crm/infrastructure/config/cifradoSecretos';

import {
  CLAVE_CONFIG_APIFACTURACION_TOKEN,
  CLAVE_CONFIG_APIFACTURACION_URL,
  GuardarConfigApifacturacionUseCase,
  PREFIJO_CONFIG_APIFACTURACION,
  probarApifacturacion,
  resolverConfigApifacturacion,
  URL_APIFACTURACION_POR_DEFECTO,
  vistaDeConfigApifacturacion,
} from '../configApifacturacion';

/** Master key for THIS test run only (never a real key). */
const CLAVE_TEST = randomBytes(32).toString('base64');
const ENV_TEST = { CRM_CONFIG_KEY: CLAVE_TEST };

/** In-memory ConfigCrmRepository fake: records every write for assertions. */
class FakeConfig implements Pick<ConfigCrmRepository, 'listar' | 'guardar' | 'eliminar'> {
  filas = new Map<string, EntradaConfigCrm>();
  guardados: GuardarConfigInput[] = [];
  eliminados: EliminarConfigInput[] = [];
  falloEnListar: Error | null = null;

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    if (this.falloEnListar) throw this.falloEnListar;
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

  /** Seed one row directly (test fixture). */
  sembrar(fila: EntradaConfigCrm): void {
    this.filas.set(fila.clave, fila);
  }
}

const fila = (clave: string, valor: string, esSecreto: boolean): EntradaConfigCrm => ({
  clave,
  valor,
  esSecreto,
  actualizadoPor: 'seed',
  actualizadoEn: new Date('2026-11-08T10:00:00.000Z'),
});

describe('resolverConfigApifacturacion', () => {
  it('sin DB ni env: sin token, URL por defecto y fuente "ninguna"', async () => {
    const repo = new FakeConfig();
    const config = await resolverConfigApifacturacion({ config: repo }, {});
    expect(config).toEqual({ token: null, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'ninguna' });
  });

  it('usa APIFACTURACION_TOKEN de env cuando no hay fila en DB (fuente "env")', async () => {
    const repo = new FakeConfig();
    const config = await resolverConfigApifacturacion(
      { config: repo },
      { APIFACTURACION_TOKEN: 'tok-de-entorno' },
    );
    expect(config.token).toBe('tok-de-entorno');
    expect(config.fuente).toBe('env');
  });

  it('la DB gana sobre env para el token (fila descifrada, fuente "db")', async () => {
    const repo = new FakeConfig();
    repo.sembrar(
      fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, cifrarSecreto('tok-de-db', ENV_TEST), true),
    );
    const config = await resolverConfigApifacturacion(
      { config: repo },
      { CRM_CONFIG_KEY: CLAVE_TEST, APIFACTURACION_TOKEN: 'tok-de-entorno' },
    );
    expect(config.token).toBe('tok-de-db');
    expect(config.fuente).toBe('db');
  });

  it('usa la URL guardada en DB cuando existe', async () => {
    const repo = new FakeConfig();
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_URL, 'https://api.otra-instancia.com', false));
    const config = await resolverConfigApifacturacion({ config: repo }, {});
    expect(config.url).toBe('https://api.otra-instancia.com');
  });

  it('una URL en DB vacía cae al default', async () => {
    const repo = new FakeConfig();
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_URL, '   ', false));
    const config = await resolverConfigApifacturacion({ config: repo }, {});
    expect(config.url).toBe(URL_APIFACTURACION_POR_DEFECTO);
  });

  it('la URL NO tiene fallback de env: solo el token lee APIFACTURACION_TOKEN', async () => {
    const repo = new FakeConfig();
    const config = await resolverConfigApifacturacion(
      { config: repo },
      { APIFACTURACION_URL: 'https://desde-env.example.com' },
    );
    expect(config.url).toBe(URL_APIFACTURACION_POR_DEFECTO);
  });

  it('token ilegible en DB: queda sin configurar y NUNCA revierte a env (secreto rotado no revive)', async () => {
    const repo = new FakeConfig();
    repo.sembrar(fila(CLAVE_CONFIG_APIFACTURACION_TOKEN, 'v1:no-es-base64-valida:x:y', true));
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config = await resolverConfigApifacturacion(
        { config: repo },
        { CRM_CONFIG_KEY: CLAVE_TEST, APIFACTURACION_TOKEN: 'tok-de-entorno' },
      );
      expect(config.token).toBeNull();
      expect(config.fuente).toBe('ninguna');
    } finally {
      aviso.mockRestore();
    }
  });

  it('si la lectura de DB falla, resuelve con env y avisa solo con el código', async () => {
    const repo = new FakeConfig();
    repo.falloEnListar = new Error('conexion mssql rechazada con secreto interno xyz');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const config = await resolverConfigApifacturacion(
        { config: repo },
        { APIFACTURACION_TOKEN: 'tok-de-entorno' },
      );
      expect(config.token).toBe('tok-de-entorno');
      expect(config.fuente).toBe('env');
      const llamadas = aviso.mock.calls.flat().join(' ');
      expect(llamadas).not.toContain('secreto interno xyz');
    } finally {
      aviso.mockRestore();
    }
  });

  it('consulta la DB con el prefijo apifacturacion.', async () => {
    const repo = new FakeConfig();
    const espiarListar = vi.spyOn(repo, 'listar');
    await resolverConfigApifacturacion({ config: repo }, {});
    expect(espiarListar).toHaveBeenCalledWith(PREFIJO_CONFIG_APIFACTURACION);
  });
});

describe('vistaDeConfigApifacturacion', () => {
  it('sin token: configurado false y tokenMascarado null', () => {
    const vista = vistaDeConfigApifacturacion({
      token: null,
      url: URL_APIFACTURACION_POR_DEFECTO,
      fuente: 'ninguna',
    });
    expect(vista).toEqual({
      configurado: false,
      tokenMascarado: null,
      url: URL_APIFACTURACION_POR_DEFECTO,
      fuente: 'ninguna',
    });
  });

  it('con token: configurado true, máscara sin el valor en claro', () => {
    const token = 'tok-super-secreto-987654321';
    const vista = vistaDeConfigApifacturacion({ token, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' });
    expect(vista.configurado).toBe(true);
    expect(vista.tokenMascarado).toContain('••••');
    expect(vista.tokenMascarado).not.toBe(token);
    expect(JSON.stringify(vista)).not.toContain(token);
    expect(vista.fuente).toBe('db');
  });
});

describe('GuardarConfigApifacturacionUseCase', () => {
  let repo: FakeConfig;

  beforeEach(() => {
    repo = new FakeConfig();
  });

  it('guarda la URL en claro (esSecreto false) con el usuario', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { url: 'https://api.apifacturacion.qa' },
      'Scott Palomino',
    );
    expect(repo.guardados).toEqual([
      {
        clave: CLAVE_CONFIG_APIFACTURACION_URL,
        valor: 'https://api.apifacturacion.qa',
        esSecreto: false,
        usuario: 'Scott Palomino',
      },
    ]);
  });

  it('aplica el default cuando la URL viene en blanco', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { url: '   ' },
      'Scott Palomino',
    );
    expect(repo.guardados[0]?.valor).toBe(URL_APIFACTURACION_POR_DEFECTO);
    expect(repo.guardados[0]?.esSecreto).toBe(false);
  });

  it('rechaza una URL inválida SIN escribir nada', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
        { url: 'no-es-una-url' },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ name: 'ErrorConfigApifacturacionInvalida', campo: 'url' });
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('rechaza una URL con protocolo distinto de http(s)', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
        { url: 'ftp://archivos.example.com' },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ campo: 'url' });
    expect(repo.guardados).toEqual([]);
  });

  it('rechaza texto no-string en URL sin escribir nada', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
        { url: 123 as unknown as string },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ campo: 'url' });
    expect(repo.guardados).toEqual([]);
  });

  it('url omitida: no escribe la URL', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      {},
      'Scott Palomino',
    );
    expect(repo.guardados).toEqual([]);
  });

  it('token omitido o vacío: mantiene el actual (ni guardar ni eliminar)', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { token: '' },
      'Scott Palomino',
    );
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('token null: elimina la clave con el usuario', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { token: null },
      'Scott Palomino',
    );
    expect(repo.eliminados).toEqual([
      { clave: CLAVE_CONFIG_APIFACTURACION_TOKEN, usuario: 'Scott Palomino' },
    ]);
    expect(repo.guardados).toEqual([]);
  });

  it('rechaza un token solo espacios SIN escribir nada', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
        { token: '   ' },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ name: 'ErrorConfigApifacturacionInvalida', campo: 'token' });
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('guarda el token CIFRADO (nunca en claro) con esSecreto true', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { token: 'mi-token-privado-123' },
      'Scott Palomino',
    );
    expect(repo.guardados).toHaveLength(1);
    const escritura = repo.guardados[0];
    expect(escritura.clave).toBe(CLAVE_CONFIG_APIFACTURACION_TOKEN);
    expect(escritura.esSecreto).toBe(true);
    expect(escritura.valor).not.toContain('mi-token-privado-123');
    expect(descifrarSecreto(escritura.valor, ENV_TEST)).toBe('mi-token-privado-123');
  });

  it('sin CRM_CONFIG_KEY: rechaza ANTES de escribir (fail-closed, nada persiste)', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: {} }).guardar(
        { url: 'https://api.example.com', token: 'nuevo-token' },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ name: 'ErrorCifradoConfig', codigo: 'CLAVE_NO_CONFIGURADA' });
    expect(repo.guardados).toEqual([]);
    expect(repo.eliminados).toEqual([]);
  });

  it('la validación de campos corre antes que el cifrado (token inválido gana sobre clave ausente)', async () => {
    await expect(
      new GuardarConfigApifacturacionUseCase({ config: repo, env: {} }).guardar(
        { url: 'https://api.example.com', token: '   ' },
        'Scott Palomino',
      ),
    ).rejects.toMatchObject({ name: 'ErrorConfigApifacturacionInvalida', campo: 'token' });
    expect(repo.guardados).toEqual([]);
  });

  it('guarda URL y token juntos, pasando el usuario en cada escritura', async () => {
    await new GuardarConfigApifacturacionUseCase({ config: repo, env: ENV_TEST }).guardar(
      { url: 'https://api.apifacturacion.dev', token: 'tok-conjunto' },
      'Marcela Quispe',
    );
    expect(repo.guardados).toHaveLength(2);
    expect(repo.guardados.map((g) => g.usuario)).toEqual(['Marcela Quispe', 'Marcela Quispe']);
    const url = repo.guardados.find((g) => g.clave === CLAVE_CONFIG_APIFACTURACION_URL);
    const token = repo.guardados.find((g) => g.clave === CLAVE_CONFIG_APIFACTURACION_TOKEN);
    expect(url?.esSecreto).toBe(false);
    expect(token?.esSecreto).toBe(true);
    expect(token?.valor).not.toContain('tok-conjunto');
  });
});

describe('probarApifacturacion', () => {
  const TOKEN = 'tok-privado-de-prueba';
  let consola: MockInstance[];

  beforeEach(() => {
    consola = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    consola.forEach((espia) => espia.mockRestore());
  });

  function respuestaJson(datos: unknown, ok = true, status = 200): Response {
    return {
      ok,
      status,
      json: () => Promise.resolve(datos),
    } as unknown as Response;
  }

  it('sin token configurado: falla con mensaje claro y sin llamar a la API', async () => {
    const fetchMock = vi.fn();
    const resultado = await probarApifacturacion(
      { token: null, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'ninguna' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('no está configurado');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta {url}/ruc/20525426778 con el token en el formulario y reporta el éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuestaJson({ razon_social: 'CONSTRUCTORES ANDINA S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO' }),
    );
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(true);
    expect(resultado.mensaje).toContain('CONSTRUCTORES ANDINA S.A.C.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.apifacturacion.com/ruc/20525426778');
    expect(init.method).toBe('POST');
    const cuerpo = String(init.body);
    expect(cuerpo).toContain(`token=${encodeURIComponent(TOKEN)}`);
  });

  it('un 401 produce un mensaje genérico que NO contiene el token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaJson({}, false, 401));
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('token');
    expect(resultado.mensaje).not.toContain(TOKEN);
  });

  it('otro error HTTP produce un mensaje genérico', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaJson({}, false, 502));
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).not.toContain(TOKEN);
  });

  it('timeout (abort) produce el mensaje de tiempo agotado', async () => {
    const aborto = new DOMException('aborted', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(aborto);
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('a tiempo');
    expect(resultado.mensaje).not.toContain(TOKEN);
  });

  it('error de red produce el mensaje genérico de conexión', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('conectar');
    expect(resultado.mensaje).not.toContain(TOKEN);
  });

  it('respuesta no-JSON produce un mensaje genérico', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('no es JSON')),
    } as unknown as Response);
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).not.toContain(TOKEN);
  });

  it('JSON sin razon_social (p. ej. token inválido) falla sin filtrar el token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuestaJson({ error: 'Token invalido', secreto: TOKEN }),
    );
    const resultado = await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resultado.ok).toBe(false);
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
  });

  it('jamás registra el token en la consola', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await probarApifacturacion(
      { token: TOKEN, url: URL_APIFACTURACION_POR_DEFECTO, fuente: 'db' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    const todo = consola.flatMap((espia) => espia.mock.calls.flat().map(String)).join('\n');
    expect(todo).not.toContain(TOKEN);
  });
});