import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError, EtapaInvalidaError, OportunidadNotFoundError } from '../../domain/errors';
import type { Empresa, Oportunidad } from '../../domain/entities';
import { MoverOportunidadUseCase, type MoverExtras } from '../moverOportunidad';
import { ActualizarSeguimientoOportunidadUseCase } from '../actualizarSeguimiento';
import { empresa, foto, makeFakeRepo, oportunidad } from './fakeRepo';

const semilla = (op: Partial<Oportunidad> = {}, otras: Oportunidad[] = [], ficha: Partial<Empresa> = {}) =>
  makeFakeRepo([empresa(ficha)], [], [oportunidad(op), ...otras]);

const mover = (
  repo: ReturnType<typeof makeFakeRepo>,
  etapa: string,
  extras: MoverExtras = {},
  id = 'o-1',
) => new MoverOportunidadUseCase(repo.oportunidadRepo).execute(id, etapa, extras);

describe('MoverOportunidadUseCase — la tarjeta es una oportunidad (S2)', () => {
  it('rejects an unknown stage and writes nothing', async () => {
    const repo = semilla();
    await expect(mover(repo, 'archivado')).rejects.toBeInstanceOf(EtapaInvalidaError);
    expect(repo.escrituras).toBe(0);
  });

  it('throws OportunidadNotFoundError for an unknown id', async () => {
    const repo = semilla();
    await expect(mover(repo, 'contactado', { medio: 'llamada' }, 'nope')).rejects.toBeInstanceOf(
      OportunidadNotFoundError,
    );
    expect(repo.escrituras).toBe(0);
  });

  it('Contactado needs a medium: from Por contactar without one the card does not move', async () => {
    const repo = semilla();
    await expect(mover(repo, 'contactado')).rejects.toThrow(/cómo se contactó/i);
    await expect(mover(repo, 'contactado', { medio: 'paloma' })).rejects.toThrow(/medio de contacto/i);
    expect(repo.oportunidades[0]?.etapa).toBe('por_contactar');
    expect(repo.escrituras).toBe(0);
  });

  it('stores the medium when moving to Contactado, and keeps it when moving on', async () => {
    const repo = semilla();
    const c = await mover(repo, 'contactado', { medio: 'whatsapp' });
    expect(c).toMatchObject({ etapa: 'contactado', medio: 'whatsapp' });
    const s = await mover(repo, 'en_seguimiento');
    expect(s).toMatchObject({ etapa: 'en_seguimiento', medio: 'whatsapp' });
    const cot = await mover(repo, 'cotizado');
    expect(cot).toMatchObject({ etapa: 'cotizado', medio: 'whatsapp' });
  });

  it('going back to Por contactar clears the medium and its free text', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' });
    const e = await mover(repo, 'por_contactar', { medio: 'correo' });
    expect(e).toMatchObject({ etapa: 'por_contactar', medio: null, medioOtro: null });
  });

  it('the stage move rejects medium "otro": it cannot carry "¿Cuál?" (the activity flow picks it)', async () => {
    const repo = semilla();
    await expect(mover(repo, 'contactado', { medio: 'otro' })).rejects.toThrow(
      'Elige el medio de contacto: llamada, correo o WhatsApp',
    );
    expect(repo.escrituras).toBe(0);
  });

  it('a stored medium "otro" is kept with its free text when moving on', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' });
    const e = await mover(repo, 'en_seguimiento');
    expect(e).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
  });
});

describe('MoverOportunidadUseCase — Perdida pide motivo (S2 caso 1, S5.1)', () => {
  it('Perdida needs a valid reason; without it the card does not move', async () => {
    const repo = semilla({ etapa: 'cotizado' });
    await expect(mover(repo, 'perdida')).rejects.toThrow(/motivo/i);
    await expect(mover(repo, 'perdida', { motivo: { categoria: 'zzz' } })).rejects.toThrow(/motivo/i);
    await expect(mover(repo, 'perdida', { motivo: { categoria: 'precio', detalle1: '  ' } })).rejects.toThrow(
      /Precio que les ofrecimos/,
    );
    await expect(mover(repo, 'perdida', { motivo: { categoria: 'otro' } })).rejects.toThrow(/Cuéntanos el motivo/);
    expect(repo.oportunidades[0]?.etapa).toBe('cotizado');
    expect(repo.escrituras).toBe(0);
  });

  it('stores each reason category with exactly the details it asks for', async () => {
    const casos = [
      [{ categoria: 'precio', detalle1: ' S/ 7,000 ', detalle2: 'S/ 6,000', notas: ' caro ' }, { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: 'S/ 6,000', notas: 'caro' }],
      [{ categoria: 'proveedor' }, { categoria: 'proveedor', detalle1: null, detalle2: null, notas: null }],
      [{ categoria: 'proveedor', detalle1: 'Norte S.A.C.', detalle2: 'dic 2027' }, { categoria: 'proveedor', detalle1: 'Norte S.A.C.', detalle2: 'dic 2027', notas: null }],
      [{ categoria: 'sin_interes', detalle1: 'ignorado', detalle2: 'ignorado', notas: 'n' }, { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: 'n' }],
      [{ categoria: 'no_contestan' }, { categoria: 'no_contestan', detalle1: null, detalle2: null, notas: null }],
      [{ categoria: 'otro', detalle1: 'Cerraron la sucursal.' }, { categoria: 'otro', detalle1: 'Cerraron la sucursal.', detalle2: null, notas: null }],
    ] as const;
    for (const [entrada, esperado] of casos) {
      const repo = semilla({ etapa: 'contactado', medio: 'llamada' });
      const e = await mover(repo, 'perdida', { motivo: entrada });
      expect(e.etapa).toBe('perdida');
      expect(e.motivo).toEqual(esperado);
    }
  });

  it('rejects a detail or notes longer than the database accepts', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'llamada' });
    await expect(mover(repo, 'perdida', { motivo: { categoria: 'precio', detalle1: 'x'.repeat(201) } })).rejects.toThrow(
      /200/,
    );
    await expect(mover(repo, 'perdida', { motivo: { categoria: 'sin_interes', notas: 'x'.repeat(301) } })).rejects.toThrow(
      /300/,
    );
    expect(repo.oportunidades[0]?.etapa).toBe('contactado');
  });

  it('Perdida clears the próxima acción and keeps the rest of the follow-up state', async () => {
    const repo = semilla({
      etapa: 'cotizado',
      medio: 'correo',
      proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' },
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-30T10:00:00.000Z',
      sugerenciaDescartadaEn: 3,
    });
    const p = await mover(repo, 'perdida', { motivo: { categoria: 'sin_interes' } });
    expect(p).toMatchObject({
      etapa: 'perdida',
      medio: 'correo',
      proximaAccion: null,
      motivo: { categoria: 'sin_interes' },
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-30T10:00:00.000Z',
      sugerenciaDescartadaEn: 3,
    });
    expect(repo.oportunidades[0]?.proximaAccion).toBeNull();
  });

  it('a rejected move to Perdida leaves the próxima acción in place', async () => {
    const repo = semilla({
      etapa: 'contactado',
      medio: 'llamada',
      proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' },
    });
    await expect(mover(repo, 'perdida')).rejects.toThrow(/motivo/i);
    expect(repo.escrituras).toBe(0);
    expect(repo.oportunidades[0]?.proximaAccion).not.toBeNull();
  });

  it('leaving Perdida deletes the reason; the medium that was there is kept', async () => {
    const repo = semilla({
      etapa: 'perdida',
      medio: 'llamada',
      motivo: { categoria: 'precio', detalle1: 'S/ 1', detalle2: null, notas: null },
    });
    const e = await mover(repo, 'contactado', { medio: 'correo' });
    expect(e).toMatchObject({ etapa: 'contactado', medio: 'correo', motivo: null });
  });

  it('losing ONE oportunidad never touches the empresa relacion nor its siblings (S7.3)', async () => {
    const hermana = oportunidad({
      idOportunidad: 'o-2',
      idEmpresa: 'e-1',
      nombre: 'Otro negocio',
      etapa: 'en_seguimiento',
      medio: 'correo',
    });
    const repo = semilla(
      { etapa: 'cotizado', medio: 'correo', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } },
      [hermana],
      { relacion: 'cliente' },
    );
    const perdida = await mover(repo, 'perdida', { motivo: { categoria: 'precio', detalle1: 'S/ 1' } });
    expect(perdida.etapa).toBe('perdida');
    // The empresa is NOT lost because one negotiation failed (S1/S5.1).
    expect(repo.rows[0]?.relacion).toBe('cliente');
    expect(repo.rows[0]).toMatchObject(empresa({ relacion: 'cliente' }));
    expect(repo.oportunidades.find((o) => o.idOportunidad === 'o-2')).toEqual(hermana);
  });
});

describe('MoverOportunidadUseCase — Ganada cierra la tarjeta (S7.6)', () => {
  const ACCION = { tipo: 'cotizar' as const, detalle: null, fecha: '2026-11-03' };

  it('Ganada clears the próxima acción and any old reason, and keeps the medium', async () => {
    const repo = semilla({
      etapa: 'cotizado',
      medio: 'correo',
      motivo: { categoria: 'precio', detalle1: 'S/ 1', detalle2: null, notas: null },
      proximaAccion: ACCION,
    });
    const g = await mover(repo, 'ganada');
    expect(g).toMatchObject({ etapa: 'ganada', medio: 'correo', proximaAccion: null, motivo: null });
    expect(repo.oportunidades[0]?.proximaAccion).toBeNull();
  });

  it('closing ONE oportunidad as Ganada leaves other open negotiations untouched (S7.6)', async () => {
    const hermana = oportunidad({
      idOportunidad: 'o-2',
      idEmpresa: 'e-1',
      nombre: 'Monitoreo cardiacos',
      etapa: 'en_seguimiento',
      medio: 'whatsapp',
      proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-10' },
      intentosSinRespuesta: 1,
    });
    const repo = semilla({ etapa: 'cotizado', medio: 'correo', proximaAccion: ACCION }, [hermana]);
    const ganada = await mover(repo, 'ganada');
    expect(ganada.etapa).toBe('ganada');
    const despues = repo.oportunidades.find((o) => o.idOportunidad === 'o-2');
    expect(despues).toEqual(hermana);
    expect(repo.rows[0]?.relacion).toBe('prospecto');
  });

  it('a normal move keeps the follow-up state of the card', async () => {
    const repo = semilla({
      etapa: 'contactado',
      medio: 'llamada',
      proximaAccion: ACCION,
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-31T10:00:00.000Z',
    });
    const e = await mover(repo, 'en_seguimiento');
    expect(e).toMatchObject({
      etapa: 'en_seguimiento',
      medio: 'llamada',
      proximaAccion: ACCION,
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-31T10:00:00.000Z',
    });
  });

  it('a stage change never touches the empresa data', async () => {
    const repo = semilla();
    await mover(repo, 'ganada');
    expect(repo.rows[0]).toEqual(empresa());
  });
});

describe('ActualizarSeguimientoOportunidadUseCase — edita sin mover', () => {
  const uc = (repo: ReturnType<typeof makeFakeRepo>) => new ActualizarSeguimientoOportunidadUseCase(repo.oportunidadRepo);

  it('changes only the medium, without moving the card', async () => {
    const repo = semilla({ etapa: 'en_seguimiento', medio: 'llamada' });
    const o = await uc(repo).execute('o-1', { medio: 'correo' });
    expect(o).toMatchObject({ etapa: 'en_seguimiento', medio: 'correo' });
  });

  it('changes only the reason of a lost card', async () => {
    const repo = semilla({
      etapa: 'perdida',
      medio: 'llamada',
      motivo: { categoria: 'proveedor', detalle1: 'Norte', detalle2: null, notas: null },
    });
    const o = await uc(repo).execute('o-1', { motivo: { categoria: 'precio', detalle1: 'S/ 7,000' } });
    expect(o.etapa).toBe('perdida');
    expect(o.medio).toBe('llamada');
    expect(o.motivo).toEqual({ categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: null });
  });

  it('replaces the stored free-text medium with null when the new medium is not Otro', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' });
    const o = await uc(repo).execute('o-1', { medio: 'correo' });
    expect(o).toMatchObject({ medio: 'correo', medioOtro: null });
  });

  it('refuses a medium on Por contactar, a reason outside Perdida, an invalid value or an empty change', async () => {
    const nueva = semilla();
    await expect(uc(nueva).execute('o-1', { medio: 'llamada' })).rejects.toThrow(/Primero pasa la oportunidad a Contactado/);
    await expect(uc(nueva).execute('o-1', { motivo: { categoria: 'precio', detalle1: 'x' } })).rejects.toThrow(
      /Solo una oportunidad en Perdida tiene motivo/,
    );
    await expect(uc(nueva).execute('o-1', {})).rejects.toThrow(/nada que actualizar/i);
    const activa = semilla({ etapa: 'contactado', medio: 'llamada' });
    await expect(uc(activa).execute('o-1', { medio: 'paloma' })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc(activa).execute('o-1', { medio: null })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    expect(nueva.escrituras + activa.escrituras).toBe(0);
    expect(activa.oportunidades[0]?.medio).toBe('llamada');
    await expect(uc(activa).execute('nope', { medio: 'llamada' })).rejects.toBeInstanceOf(OportunidadNotFoundError);
  });
});
