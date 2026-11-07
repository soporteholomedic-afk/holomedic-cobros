import { describe, expect, it } from 'vitest';

import { UMBRAL_INTENTOS } from '../../domain/entities';
import { DatosEmpresaInvalidosError, OportunidadNotFoundError } from '../../domain/errors';
import { ListarHistorialUseCase } from '../listarHistorial';
import { ResolverSugerenciaUseCase } from '../resolverSugerencia';
import { NOW, empresa, foto, makeFakeRepo, oportunidad, type FakeRepo } from './fakeRepo';

const MUCHOS = oportunidad({
  etapa: 'contactado',
  medio: 'llamada',
  intentosSinRespuesta: UMBRAL_INTENTOS,
  faltaResponderDesde: NOW,
  proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' },
});
const MSG = 'La sugerencia ya no corresponde a esta tarjeta.';
const uc = (repo: FakeRepo) => new ResolverSugerenciaUseCase(repo.oportunidadRepo);

describe('ResolverSugerenciaUseCase — Pasar a Perdida (la sugerencia vive en la oportunidad)', () => {
  it('moves to Perdida with motivo no_contestan, clears next action and pending reply, keeps the counter, writes no history', async () => {
    const repo = makeFakeRepo([empresa()], [], [MUCHOS]);
    const o = await uc(repo).execute('o-1', 'perder');
    expect(o).toMatchObject({
      etapa: 'perdida',
      motivo: { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null },
      proximaAccion: null,
      faltaResponderDesde: null,
      intentosSinRespuesta: UMBRAL_INTENTOS,
      medio: 'llamada',
    });
    expect(repo.oportunidades[0]?.etapa).toBe('perdida');
    expect(repo.interacciones).toHaveLength(0);
    expect(repo.seguimientos).toBe(1);
    // Losing the deal never changes the empresa (S5.1).
    expect(repo.rows[0]?.relacion).toBe('prospecto');
    expect(repo.escrituras).toBe(1);
  });
});

describe('ResolverSugerenciaUseCase — Seguir intentando', () => {
  it('stores the current count and changes nothing else', async () => {
    const repo = makeFakeRepo([empresa()], [], [{ ...MUCHOS, intentosSinRespuesta: 4 }]);
    const o = await uc(repo).execute('o-1', 'seguir');
    expect(o).toMatchObject({
      sugerenciaDescartadaEn: 4,
      etapa: 'contactado',
      intentosSinRespuesta: 4,
      faltaResponderDesde: NOW,
      proximaAccion: { tipo: 'llamar', fecha: '2026-11-03' },
    });
    expect(repo.interacciones).toHaveLength(0);
  });

  it('is not valid again until one more failed attempt (same count)', async () => {
    const repo = makeFakeRepo([empresa()], [], [MUCHOS]);
    const useCase = uc(repo);
    await useCase.execute('o-1', 'seguir');
    const antes = foto(repo);
    await expect(useCase.execute('o-1', 'seguir')).rejects.toThrow(MSG);
    await expect(useCase.execute('o-1', 'perder')).rejects.toThrow(MSG);
    expect(foto(repo)).toEqual(antes);
  });
});

describe('ResolverSugerenciaUseCase — only while the suggestion shows', () => {
  const casos: [string, ReturnType<typeof oportunidad>][] = [
    ['fewer attempts than the threshold', oportunidad({ ...MUCHOS, intentosSinRespuesta: UMBRAL_INTENTOS - 1 })],
    ['a Ganada card', oportunidad({ ...MUCHOS, etapa: 'ganada' })],
    ['a Perdida card', oportunidad({ ...MUCHOS, etapa: 'perdida', motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null } })],
    ['a dismissed count equal to the attempts', oportunidad({ ...MUCHOS, sugerenciaDescartadaEn: UMBRAL_INTENTOS })],
  ];
  it.each(casos)('rejects both actions for %s and stores nothing', async (_n, seed) => {
    for (const accion of ['perder', 'seguir'] as const) {
      const repo = makeFakeRepo([empresa()], [], [seed]);
      const antes = foto(repo);
      const error = await uc(repo).execute('o-1', accion).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
      expect((error as Error).message).toBe(MSG);
      expect(foto(repo)).toEqual(antes);
    }
  });

  it('shows again after one more failed attempt: a dismissed count lower than the attempts is valid', async () => {
    const repo = makeFakeRepo([empresa()], [], [oportunidad({ ...MUCHOS, intentosSinRespuesta: 4, sugerenciaDescartadaEn: 3 })]);
    const o = await uc(repo).execute('o-1', 'perder');
    expect(o.etapa).toBe('perdida');
  });

  it('rejects an unknown action and throws OportunidadNotFoundError for an unknown card', async () => {
    const repo = makeFakeRepo([empresa()], [], [MUCHOS]);
    await expect(uc(repo).execute('o-1', 'borrar')).rejects.toThrow('Elige qué hacer con la sugerencia.');
    await expect(uc(repo).execute('nope', 'perder')).rejects.toBeInstanceOf(OportunidadNotFoundError);
    expect(repo.escrituras).toBe(0);
  });
});

describe('ListarHistorialUseCase — historial con idOportunidad', () => {
  const fila = (id: number, idEmpresa = 'e-1', idOportunidad: string | null = null) => ({
    idInteraccion: id, idEmpresa, idOportunidad, fecha: NOW, idUsuario: 'u-1', nombreUsuario: 'Scott',
    direccion: 'saliente' as const, medio: 'llamada' as const, medioOtro: null,
    resultado: 'conversamos' as const, resumen: `r${id}`,
  });

  it('returns the history of the empresa, newest first, carrying the linked oportunidad', async () => {
    const repo = makeFakeRepo(
      [empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })],
      [fila(1, 'e-1', 'o-1'), fila(3, 'e-1'), fila(2, 'e-1', 'o-2'), fila(9, 'e-2')],
    );
    const lista = await new ListarHistorialUseCase(repo.empresaRepo).execute('e-1');
    expect(lista.map((i) => [i.idInteraccion, i.idOportunidad])).toEqual([[3, null], [2, 'o-2'], [1, 'o-1']]);
  });

  it('returns an empty list for an empresa without history', async () => {
    expect(await new ListarHistorialUseCase(makeFakeRepo([empresa()]).empresaRepo).execute('e-1')).toEqual([]);
  });

  it('throws EmpresaNotFoundError for an unknown empresa', async () => {
    await expect(new ListarHistorialUseCase(makeFakeRepo().empresaRepo).execute('nope')).rejects.toThrow(/Empresa not found/);
  });
});
