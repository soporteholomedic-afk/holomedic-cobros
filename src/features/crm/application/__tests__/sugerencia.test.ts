import { describe, expect, it } from 'vitest';

import { UMBRAL_INTENTOS } from '../../domain/entities';
import { DatosEmpresaInvalidosError, EmpresaNotFoundError } from '../../domain/errors';
import { ListarHistorialUseCase } from '../listarHistorial';
import { ResolverSugerenciaUseCase } from '../resolverSugerencia';
import { NOW, empresa, foto, makeFakeRepo } from './fakeRepo';

const MUCHOS = empresa({
  etapa: 'contactado',
  medio: 'llamada',
  intentosSinRespuesta: UMBRAL_INTENTOS,
  faltaResponderDesde: NOW,
  proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' },
});
const MSG = 'La sugerencia ya no corresponde a esta tarjeta.';

describe('ResolverSugerenciaUseCase — Pasar a Perdido (L8, S2)', () => {
  it('moves to Perdido with motivo no_contestan, clears next action and pending reply, keeps the counter, writes no history', async () => {
    const repo = makeFakeRepo([MUCHOS]);
    const e = await new ResolverSugerenciaUseCase(repo).execute('e-1', 'perder');
    expect(e).toMatchObject({
      etapa: 'perdido',
      motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
      proximaAccion: null,
      faltaResponderDesde: null,
      intentosSinRespuesta: UMBRAL_INTENTOS,
      medio: 'llamada',
    });
    expect(repo.rows[0]?.etapa).toBe('perdido');
    expect(repo.interacciones).toHaveLength(0);
    expect(repo.seguimientos).toBe(1);
  });
});

describe('ResolverSugerenciaUseCase — Seguir intentando (L8)', () => {
  it('stores the current count and changes nothing else', async () => {
    const repo = makeFakeRepo([empresa({ ...MUCHOS, intentosSinRespuesta: 4 })]);
    const e = await new ResolverSugerenciaUseCase(repo).execute('e-1', 'seguir');
    expect(e).toMatchObject({
      sugerenciaDescartadaEn: 4,
      etapa: 'contactado',
      intentosSinRespuesta: 4,
      faltaResponderDesde: NOW,
      proximaAccion: { tipo: 'llamar', fecha: '2026-11-03' },
    });
    expect(repo.interacciones).toHaveLength(0);
  });

  it('is not valid again until one more failed attempt (same count)', async () => {
    const repo = makeFakeRepo([MUCHOS]);
    const uc = new ResolverSugerenciaUseCase(repo);
    await uc.execute('e-1', 'seguir');
    const antes = foto(repo);
    await expect(uc.execute('e-1', 'seguir')).rejects.toThrow(MSG);
    await expect(uc.execute('e-1', 'perder')).rejects.toThrow(MSG);
    expect(foto(repo)).toEqual(antes);
  });
});

describe('ResolverSugerenciaUseCase — only while the suggestion shows', () => {
  const casos: [string, ReturnType<typeof empresa>][] = [
    ['fewer attempts than the threshold', empresa({ ...MUCHOS, intentosSinRespuesta: UMBRAL_INTENTOS - 1 })],
    ['a Cliente card', empresa({ ...MUCHOS, etapa: 'cliente' })],
    ['a Perdido card', empresa({ ...MUCHOS, etapa: 'perdido', motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null } })],
    ['a dismissed count equal to the attempts', empresa({ ...MUCHOS, sugerenciaDescartadaEn: UMBRAL_INTENTOS })],
  ];
  it.each(casos)('rejects both actions for %s and stores nothing', async (_n, seed) => {
    for (const accion of ['perder', 'seguir'] as const) {
      const repo = makeFakeRepo([seed]);
      const antes = foto(repo);
      const error = await new ResolverSugerenciaUseCase(repo).execute('e-1', accion).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
      expect((error as Error).message).toBe(MSG);
      expect(foto(repo)).toEqual(antes);
    }
  });

  it('shows again after one more failed attempt: a dismissed count lower than the attempts is valid', async () => {
    const repo = makeFakeRepo([empresa({ ...MUCHOS, intentosSinRespuesta: 4, sugerenciaDescartadaEn: 3 })]);
    const e = await new ResolverSugerenciaUseCase(repo).execute('e-1', 'perder');
    expect(e.etapa).toBe('perdido');
  });

  it('rejects an unknown action and throws not found for an unknown empresa', async () => {
    const repo = makeFakeRepo([MUCHOS]);
    await expect(new ResolverSugerenciaUseCase(repo).execute('e-1', 'borrar')).rejects.toThrow(
      'Elige qué hacer con la sugerencia.',
    );
    await expect(new ResolverSugerenciaUseCase(repo).execute('nope', 'perder')).rejects.toBeInstanceOf(
      EmpresaNotFoundError,
    );
    expect(repo.escrituras).toBe(0);
  });
});

describe('ListarHistorialUseCase (S1)', () => {
  const fila = (id: number, idEmpresa = 'e-1') => ({
    idInteraccion: id, idEmpresa, fecha: NOW, idUsuario: 'u-1', nombreUsuario: 'Scott',
    direccion: 'saliente' as const, medio: 'llamada' as const, medioOtro: null,
    resultado: 'conversamos' as const, resumen: `r${id}`,
  });

  it('returns the history of the empresa, newest first, and nothing of other empresas', async () => {
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })], [fila(1), fila(3), fila(2), fila(9, 'e-2')]);
    const lista = await new ListarHistorialUseCase(repo).execute('e-1');
    expect(lista.map((i) => i.idInteraccion)).toEqual([3, 2, 1]);
  });

  it('returns an empty list for an empresa without history', async () => {
    expect(await new ListarHistorialUseCase(makeFakeRepo([empresa()])).execute('e-1')).toEqual([]);
  });

  it('throws EmpresaNotFoundError for an unknown empresa', async () => {
    await expect(new ListarHistorialUseCase(makeFakeRepo()).execute('nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });
});
