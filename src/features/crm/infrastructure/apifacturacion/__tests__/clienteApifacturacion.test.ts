// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfigApifacturacion } from '@/features/crm/application/configuracion/configApifacturacion';
import {
  ConsultaNoConfiguradaError,
  RucNoEncontradoError,
  ServicioConsultaError,
} from '@/features/crm/domain/errors';
import { ApiFacturacionCliente } from '../clienteApifacturacion';

/**
 * Adapter contract for apifacturacion.com (crm-consulta-sunat T4, S1).
 * The fetch is INJECTED (constructor param), so no global stub is needed;
 * the config arrives already resolved (DB > env is the T2 resolver's job)
 * via an async provider, exactly like the route wires it.
 */

const TOKEN = 'tok-secreto-de-test';
const URL_BASE = 'https://api.apifacturacion.com';
const RUC = '20525426778';

const JSON_OK = JSON.stringify({
  razon_social: 'CONSTRUCTORES ANDINA S.A.C.',
  direccion: 'Av. Los Próceres 210, San Isidro',
  ubigeo: '150115',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
});

function configResuelta(token: string | null = TOKEN, url: string = URL_BASE): ConfigApifacturacion {
  return { token, url, fuente: token === null ? 'ninguna' : 'db' };
}

function crearCliente(
  config: ConfigApifacturacion = configResuelta(),
  fetchMock: ReturnType<typeof vi.fn> = vi.fn(),
): { cliente: ApiFacturacionCliente; fetchMock: ReturnType<typeof vi.fn> } {
  const c = new ApiFacturacionCliente({
    config: async () => config,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { cliente: c, fetchMock };
}

function respuestaApifacturacion(status: number, cuerpo: string): Response {
  return new Response(cuerpo, { status, headers: { 'Content-Type': 'application/json' } });
}

describe('ApiFacturacionCliente', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consulta con POST {url}/ruc/{ruc}, el token SOLO en el form, y mapea los datos', async () => {
    const { cliente, fetchMock } = crearCliente(
      configResuelta(),
      vi.fn().mockResolvedValue(respuestaApifacturacion(200, JSON_OK)),
    );

    const datos = await cliente.consultar(RUC);

    expect(datos).toEqual({
      razonSocial: 'CONSTRUCTORES ANDINA S.A.C.',
      direccion: 'Av. Los Próceres 210, San Isidro',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.apifacturacion.com/ruc/20525426778');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const cuerpo = new URLSearchParams(String(init.body));
    expect(cuerpo.get('token')).toBe(TOKEN);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('respeta la URL configurada (DB) y normaliza el slash final', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuestaApifacturacion(200, JSON_OK));
    const { cliente } = crearCliente(configResuelta(TOKEN, 'https://api.qa.example.com/'), fetchMock);

    await cliente.consultar(RUC);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`https://api.qa.example.com/ruc/${RUC}`);
  });

  it('razon_social ausente → RucNoEncontradoError mencionando el RUC', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      // Fresh Response per call: a body can only be read once.
      vi.fn().mockImplementation(async () => respuestaApifacturacion(200, JSON.stringify({ error: 'sin datos' }))),
    );

    await expect(cliente.consultar(RUC)).rejects.toBeInstanceOf(RucNoEncontradoError);
    await expect(cliente.consultar(RUC)).rejects.toThrow(`No se encontraron datos SUNAT para el RUC: ${RUC}`);
  });

  it('razon_social en blanco → RucNoEncontradoError', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockResolvedValue(respuestaApifacturacion(200, JSON.stringify({ razon_social: '   ' }))),
    );

    await expect(cliente.consultar(RUC)).rejects.toBeInstanceOf(RucNoEncontradoError);
  });

  it('cuerpo 200 que no es un objeto → RucNoEncontradoError', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockResolvedValue(respuestaApifacturacion(200, '[]')),
    );

    await expect(cliente.consultar(RUC)).rejects.toBeInstanceOf(RucNoEncontradoError);
  });

  it('JSON no parseable → ServicioConsultaError (servicio caído, no RUC inexistente)', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockResolvedValue(respuestaApifacturacion(200, 'no-soy-json')),
    );

    await expect(cliente.consultar(RUC)).rejects.toBeInstanceOf(ServicioConsultaError);
  });

  it('HTTP fallido (401/500) → ServicioConsultaError con el código', async () => {
    for (const status of [401, 500]) {
      const { cliente } = crearCliente(
        configResuelta(),
        vi.fn().mockResolvedValue(respuestaApifacturacion(status, '{}')),
      );
      const error = await cliente.consultar(RUC).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServicioConsultaError);
      expect((error as Error).message).toContain(`HTTP ${status}`);
    }
  });

  it('timeout (TimeoutError) → ServicioConsultaError «no respondió a tiempo»', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );

    const error = await cliente.consultar(RUC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServicioConsultaError);
    expect((error as Error).message).toBe('apifacturacion no respondió a tiempo');
  });

  it('fallo de red → ServicioConsultaError «No se pudo conectar»', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const error = await cliente.consultar(RUC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServicioConsultaError);
    expect((error as Error).message).toBe('No se pudo conectar con apifacturacion');
  });

  it('sin token configurado → ConsultaNoConfiguradaError y NI UNA llamada a la API', async () => {
    const { cliente, fetchMock } = crearCliente(configResuelta(null));

    const error = await cliente.consultar(RUC).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConsultaNoConfiguradaError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nunca registra el token (ni en respuestas ni en fallos)', async () => {
    const espias = ['log', 'warn', 'error'].map((metodo) =>
      vi.spyOn(console, metodo as 'log' | 'warn' | 'error').mockImplementation(() => undefined),
    );
    const fallas = [
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
      vi.fn().mockResolvedValue(respuestaApifacturacion(500, '{}')),
    ];
    for (const fetchMock of fallas) {
      const { cliente } = crearCliente(configResuelta(), fetchMock);
      await cliente.consultar(RUC).catch(() => undefined);
    }
    for (const espia of espias) {
      expect(JSON.stringify(espia.mock.calls)).not.toContain(TOKEN);
    }
  });

  it('campos externos no string → null (null-safe), campos desconocidos ignorados', async () => {
    const { cliente } = crearCliente(
      configResuelta(),
      vi.fn().mockResolvedValue(
        respuestaApifacturacion(200, JSON.stringify({ razon_social: 'X Y S.A.C.', direccion: 42, estado: null, condicion: true, ubigeo: 'x' })),
      ),
    );

    const datos = await cliente.consultar(RUC);
    expect(datos).toEqual({ razonSocial: 'X Y S.A.C.', direccion: null, estado: null, condicion: null });
  });
});
