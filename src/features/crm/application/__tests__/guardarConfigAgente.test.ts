import { describe, expect, it } from 'vitest';

import type { EntradaConfigCrm } from '../../domain/entities';
import type { CambioConfig, GuardarConfigInput } from '../../domain/ports';
import { CLAVES_CONFIG_AGENTE } from '../resolverConfigAgente';
import { ErrorConfigAgenteInvalida, GuardarConfigAgenteUseCase } from '../guardarConfigAgente';

/**
 * Contract of the admin write path for the agent config (E5·T3):
 * STRICT validation BEFORE any write, every changed key persisted as
 * non-secret, kill switch stored as 'true'/'false', resolved config
 * returned afterwards.
 */

class FakeConfig {
  guardados: GuardarConfigInput[] = [];
  lotes: CambioConfig[][] = [];
  almacen = new Map<string, string>();

  async guardarVarios(cambios: CambioConfig[], usuario: string): Promise<void> {
    this.lotes.push(cambios);
    for (const cambio of cambios) {
      this.guardados.push({ ...cambio, usuario });
      this.almacen.set(cambio.clave, cambio.valor);
    }
  }

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    return [...this.almacen.entries()]
      .filter(([clave]) => clave.startsWith(prefijo))
      .map(([clave, valor]) => ({
        clave,
        valor,
        esSecreto: false,
        actualizadoPor: 'admin',
        actualizadoEn: new Date(),
      }));
  }
}

function crear(): { config: FakeConfig; useCase: GuardarConfigAgenteUseCase } {
  const config = new FakeConfig();
  return { config, useCase: new GuardarConfigAgenteUseCase({ config }) };
}

describe('GuardarConfigAgenteUseCase — validación estricta (E5·T3)', () => {
  const invalidos: Array<[string, Parameters<GuardarConfigAgenteUseCase['guardar']>[0]]> = [
    ['umbralConfianza', { umbralConfianza: 0 }],
    ['umbralConfianza', { umbralConfianza: 1.01 }],
    ['umbralConfianza', { umbralConfianza: Number.NaN }],
    ['maxIntercambios', { maxIntercambios: 0 }],
    ['maxIntercambios', { maxIntercambios: 2.5 }],
    ['horarioDesde', { horarioDesde: 24 }],
    ['horarioDesde', { horarioDesde: -1 }],
    ['horarioHasta', { horarioHasta: 7.5 }],
    ['textoEscalado', { textoEscalado: '   ' }],
    ['textoEscalado', { textoEscalado: 'x'.repeat(501) }],
    ['habilitado', { habilitado: 'si' as unknown as boolean }],
  ];

  it.each(invalidos)('rechaza %s inválido con ErrorConfigAgenteInvalida antes de escribir', async (campo, cambios) => {
    const { config, useCase } = crear();

    const intento = useCase.guardar({ habilitado: true, ...cambios }, 'admin');

    await expect(intento).rejects.toBeInstanceOf(ErrorConfigAgenteInvalida);
    await expect(intento).rejects.toMatchObject({ campo });
    expect(config.guardados).toEqual([]);
  });

  it('un campo inválido entre varios válidos no escribe NINGUNO', async () => {
    const { config, useCase } = crear();

    await expect(
      useCase.guardar({ umbralConfianza: 0.8, horarioDesde: 30 }, 'admin'),
    ).rejects.toBeInstanceOf(ErrorConfigAgenteInvalida);
    expect(config.guardados).toEqual([]);
  });
});

describe('GuardarConfigAgenteUseCase — persistencia (E5·T3)', () => {
  it('persiste cada clave cambiada como no secreta con el usuario y devuelve el config resuelto', async () => {
    const { config, useCase } = crear();

    const resuelta = await useCase.guardar(
      {
        habilitado: true,
        umbralConfianza: 0.75,
        maxIntercambios: 5,
        horarioDesde: 6,
        horarioHasta: 22,
        textoEscalado: ' Hola ',
      },
      'maria',
    );

    expect(config.guardados).toEqual([
      { clave: CLAVES_CONFIG_AGENTE.habilitado, valor: 'true', esSecreto: false, usuario: 'maria' },
      { clave: CLAVES_CONFIG_AGENTE.umbralConfianza, valor: '0.75', esSecreto: false, usuario: 'maria' },
      { clave: CLAVES_CONFIG_AGENTE.maxIntercambios, valor: '5', esSecreto: false, usuario: 'maria' },
      { clave: CLAVES_CONFIG_AGENTE.horarioDesde, valor: '6', esSecreto: false, usuario: 'maria' },
      { clave: CLAVES_CONFIG_AGENTE.horarioHasta, valor: '22', esSecreto: false, usuario: 'maria' },
      { clave: CLAVES_CONFIG_AGENTE.textoEscalado, valor: 'Hola', esSecreto: false, usuario: 'maria' },
    ]);
    expect(config.lotes).toHaveLength(1);
    expect(resuelta).toMatchObject({
      habilitado: true,
      umbralConfianza: 0.75,
      maxIntercambios: 5,
      horarioDesde: 6,
      horarioHasta: 22,
      textoEscalado: 'Hola',
    });
  });

  it('solo escribe las claves presentes en los cambios', async () => {
    const { config, useCase } = crear();

    await useCase.guardar({ horarioHasta: 20 }, 'maria');

    expect(config.guardados.map((g) => g.clave)).toEqual([CLAVES_CONFIG_AGENTE.horarioHasta]);
  });

  it("alternarKillSwitch(false) persiste 'false' y el config resuelto queda apagado", async () => {
    const { config, useCase } = crear();

    const resuelta = await useCase.alternarKillSwitch(false, 'maria');

    expect(config.guardados).toEqual([
      { clave: CLAVES_CONFIG_AGENTE.habilitado, valor: 'false', esSecreto: false, usuario: 'maria' },
    ]);
    expect(resuelta.habilitado).toBe(false);
  });
});
