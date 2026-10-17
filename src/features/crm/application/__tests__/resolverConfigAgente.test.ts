import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EntradaConfigCrm } from '../../domain/entities';
import { crearConfigAgente, TEXTO_ESCALADO_POR_DEFECTO } from '../configAgente';
import { CLAVES_CONFIG_AGENTE, resolverConfigAgente } from '../resolverConfigAgente';

/**
 * Contract of the hot DB-backed agent config (agente-ia-crm E5·T3): a
 * DB value overrides env per key, invalid DB values fall back through
 * the same crearConfigAgente parsing, nothing is cached (the kill
 * switch bites on the very next run) and a DB failure degrades to env.
 */

function fila(clave: string, valor: string): EntradaConfigCrm {
  return { clave, valor, esSecreto: false, actualizadoPor: 'admin', actualizadoEn: new Date() };
}

class FakeConfig {
  filas: EntradaConfigCrm[] = [];
  prefijos: string[] = [];
  lecturas = 0;
  fallo: Error | null = null;

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    this.lecturas += 1;
    this.prefijos.push(prefijo);
    if (this.fallo !== null) throw this.fallo;
    return this.filas.filter((f) => f.clave.startsWith(prefijo));
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolverConfigAgente (E5·T3)', () => {
  it('sin filas en DB → equivale al config de env', async () => {
    const config = new FakeConfig();
    const env = { AGENTE_UMBRAL_CONF: '0.7', AGENTE_MAX_INTERCAMBIOS: '5' };

    const resuelta = await resolverConfigAgente({ config }, env);

    expect(resuelta).toEqual(crearConfigAgente(env));
    expect(config.prefijos).toEqual(['agente.']);
  });

  it('un valor de DB gana sobre env, clave por clave', async () => {
    const config = new FakeConfig();
    config.filas = [
      fila(CLAVES_CONFIG_AGENTE.habilitado, 'false'),
      fila(CLAVES_CONFIG_AGENTE.umbralConfianza, '0.9'),
      fila(CLAVES_CONFIG_AGENTE.maxIntercambios, '3'),
      fila(CLAVES_CONFIG_AGENTE.horarioDesde, '6'),
      fila(CLAVES_CONFIG_AGENTE.horarioHasta, '22'),
      fila(CLAVES_CONFIG_AGENTE.textoEscalado, 'Texto de DB'),
    ];
    const env = { AGENTE_HABILITADO: 'true', AGENTE_UMBRAL_CONF: '0.5', AGENTE_MAX_INTERCAMBIOS: '12' };

    const resuelta = await resolverConfigAgente({ config }, env);

    expect(resuelta).toEqual({
      habilitado: false,
      umbralConfianza: 0.9,
      maxIntercambios: 3,
      horarioDesde: 6,
      horarioHasta: 22,
      textoEscalado: 'Texto de DB',
    });
  });

  it('claves ausentes en DB conservan el valor de env', async () => {
    const config = new FakeConfig();
    config.filas = [fila(CLAVES_CONFIG_AGENTE.horarioDesde, '9')];

    const resuelta = await resolverConfigAgente({ config }, { AGENTE_UMBRAL_CONF: '0.8' });

    expect(resuelta.horarioDesde).toBe(9);
    expect(resuelta.umbralConfianza).toBe(0.8);
  });

  it('valor inválido en DB cae a env/default como hoy', async () => {
    const config = new FakeConfig();
    config.filas = [
      fila(CLAVES_CONFIG_AGENTE.umbralConfianza, 'abc'),
      fila(CLAVES_CONFIG_AGENTE.horarioDesde, '99'),
      fila(CLAVES_CONFIG_AGENTE.textoEscalado, '   '),
    ];

    const resuelta = await resolverConfigAgente({ config }, { AGENTE_HORARIO_DESDE: '7' });

    expect(resuelta.umbralConfianza).toBe(0.6);
    expect(resuelta.horarioDesde).toBe(8);
    expect(resuelta.textoEscalado).toBe(TEXTO_ESCALADO_POR_DEFECTO);
  });

  it("kill switch de DB: cualquier valor fuera de 1/true/si/yes apaga el agente", async () => {
    const config = new FakeConfig();
    config.filas = [fila(CLAVES_CONFIG_AGENTE.habilitado, 'garbage')];

    const resuelta = await resolverConfigAgente({ config }, { AGENTE_HABILITADO: 'true' });

    expect(resuelta.habilitado).toBe(false);
  });

  it('sin caché: dos llamadas leen la DB dos veces y ven el cambio', async () => {
    const config = new FakeConfig();
    config.filas = [fila(CLAVES_CONFIG_AGENTE.habilitado, 'true')];

    const primera = await resolverConfigAgente({ config }, {});
    config.filas = [fila(CLAVES_CONFIG_AGENTE.habilitado, 'false')];
    const segunda = await resolverConfigAgente({ config }, {});

    expect(primera.habilitado).toBe(true);
    expect(segunda.habilitado).toBe(false);
    expect(config.lecturas).toBe(2);
  });

  it('falla la DB → warn sin secretos y cae al config de env', async () => {
    const config = new FakeConfig();
    config.fallo = new Error('conexión caída: password=hunter2');
    const env = { AGENTE_MAX_INTERCAMBIOS: '4' };

    const resuelta = await resolverConfigAgente({ config }, env);

    expect(resuelta).toEqual(crearConfigAgente(env));
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('hunter2');
  });
});
