import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorMemoriaCrm, MemoriaEngramHttp } from '../memoriaEngramHttp';
import { MemoriaSimulada } from '../memoriaSimulada';
import {
  __resetAvisosMemoriaForTests,
  crearMemoriaConversacion,
  crearMemoriaConversacionConfigurable,
} from '../crearMemoriaConversacion';
import type { EntradaConfigCrm } from '../../../domain/entities';

/**
 * Factory contract (agente-ia-crm E2·T2) — mirrors crearEnviadorWhatsapp
 * EXACTLY, with ENGRAM_CRM_URL as the single selector:
 * - ENGRAM_CRM_URL set → MemoriaEngramHttp, in ANY environment (dev or
 *   prod), no warnings.
 * - no URL + development → MemoriaSimulada + console.warn ONCE per
 *   process ("seteá ENGRAM_CRM_URL al conectar Engram").
 * - no URL + production → FAIL CLOSED: an adapter whose every method
 *   rejects ErrorMemoriaCrm MEMORIA_NO_CONFIGURADA + console.error ONCE
 *   per process explaining how to configure. Production never
 *   simulates silently.
 */

beforeEach(() => {
  __resetAvisosMemoriaForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('crearMemoriaConversacion — selección de adapter (E2·T2)', () => {
  it('ENGRAM_CRM_URL seteada → adapter HTTP en CUALQUIER entorno, sin avisos', () => {
    vi.stubEnv('ENGRAM_CRM_URL', 'http://127.0.0.1:7438');
    vi.stubEnv('NODE_ENV', 'production');

    const memoria = crearMemoriaConversacion();

    expect(memoria).toBeInstanceOf(MemoriaEngramHttp);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('sin ENGRAM_CRM_URL en development → simulado + console.warn UNA vez por proceso', () => {
    vi.stubEnv('ENGRAM_CRM_URL', '');
    vi.stubEnv('NODE_ENV', 'development');

    const memoria = crearMemoriaConversacion();

    expect(memoria).toBeInstanceOf(MemoriaSimulada);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/ENGRAM_CRM_URL/));
    expect(console.error).not.toHaveBeenCalled();

    // Una segunda construcción NO repite el aviso (spam-free).
    crearMemoriaConversacion();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('sin ENGRAM_CRM_URL en production → FAIL CLOSED: todo método rechaza MEMORIA_NO_CONFIGURADA + console.error una vez', async () => {
    vi.stubEnv('ENGRAM_CRM_URL', '');
    vi.stubEnv('NODE_ENV', 'production');

    const memoria = crearMemoriaConversacion();

    expect(memoria).not.toBeInstanceOf(MemoriaSimulada);
    expect(memoria).not.toBeInstanceOf(MemoriaEngramHttp);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/ENGRAM_CRM_URL/));
    expect(console.warn).not.toHaveBeenCalled();

    const ENTRADA = {
      empresaId: 3,
      conversacionId: 7,
      nivel: 'chat' as const,
      tipo: 'hecho_cliente' as const,
      titulo: 'X',
      contenido: 'Y',
      operationId: 'op-1',
    };

    await expect(memoria.contexto(3)).rejects.toBeInstanceOf(ErrorMemoriaCrm);
    await expect(memoria.contexto(3)).rejects.toMatchObject({
      codigo: 'MEMORIA_NO_CONFIGURADA',
    });
    await expect(memoria.buscar('q', 3, 7, 5)).rejects.toMatchObject({
      codigo: 'MEMORIA_NO_CONFIGURADA',
    });
    await expect(memoria.guardar(ENTRADA)).rejects.toMatchObject({
      codigo: 'MEMORIA_NO_CONFIGURADA',
    });
    await expect(memoria.pinear(1)).rejects.toMatchObject({
      codigo: 'MEMORIA_NO_CONFIGURADA',
    });

    // Una segunda construcción NO repite el error.
    crearMemoriaConversacion();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

function fila(clave: string, valor: string): EntradaConfigCrm {
  return { clave, valor, esSecreto: false, actualizadoPor: 'admin', actualizadoEn: new Date() };
}

function nombreDeAdapter(memoria: object): 'http' | 'simulada' | 'failClosed' {
  if (memoria instanceof MemoriaEngramHttp) return 'http';
  if (memoria instanceof MemoriaSimulada) return 'simulada';
  return 'failClosed';
}

describe('crearMemoriaConversacionConfigurable (E5·T5b)', () => {
  for (const url of ['http://127.0.0.1:7438', '']) {
    for (const nodeEnv of ['development', 'production']) {
      it(`mismo adapter que el de entorno: url='${url}' NODE_ENV=${nodeEnv}`, async () => {
        vi.stubEnv('ENGRAM_CRM_URL', url);
        vi.stubEnv('NODE_ENV', nodeEnv);
        const esperado = nombreDeAdapter(crearMemoriaConversacion());

        vi.stubEnv('ENGRAM_CRM_URL', '');
        const filas = url === '' ? [] : [fila('memoria.url', url)];
        const memoria = await crearMemoriaConversacionConfigurable({
          config: { listar: async () => filas },
        });

        expect(nombreDeAdapter(memoria)).toBe(esperado);
      });
    }
  }

  it('sin config delega al comportamiento de entorno', async () => {
    vi.stubEnv('ENGRAM_CRM_URL', 'http://127.0.0.1:7438');
    expect(await crearMemoriaConversacionConfigurable({})).toBeInstanceOf(MemoriaEngramHttp);
  });

  it('la URL de la DB gana sobre el entorno y no hay caché entre llamadas', async () => {
    vi.stubEnv('ENGRAM_CRM_URL', 'http://env:1');
    vi.stubEnv('NODE_ENV', 'production');
    let filas: EntradaConfigCrm[] = [];
    const deps = { config: { listar: async () => filas } };

    expect(await crearMemoriaConversacionConfigurable(deps)).toBeInstanceOf(MemoriaEngramHttp);
    vi.stubEnv('ENGRAM_CRM_URL', '');
    expect(nombreDeAdapter(await crearMemoriaConversacionConfigurable(deps))).toBe('failClosed');
    filas = [fila('memoria.url', 'http://db:2')];
    expect(await crearMemoriaConversacionConfigurable(deps)).toBeInstanceOf(MemoriaEngramHttp);
  });

  it('producción sin URL en ninguna fuente → fail closed MEMORIA_NO_CONFIGURADA', async () => {
    vi.stubEnv('ENGRAM_CRM_URL', '');
    vi.stubEnv('NODE_ENV', 'production');

    const memoria = await crearMemoriaConversacionConfigurable({
      config: { listar: async () => [] },
    });

    await expect(memoria.contexto(3)).rejects.toMatchObject({ codigo: 'MEMORIA_NO_CONFIGURADA' });
  });
});
