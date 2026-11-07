import { describe, expect, it } from 'vitest';

import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  OportunidadDeOtraEmpresaError,
  OportunidadNotFoundError,
} from '../../domain/errors';
import type { Empresa, Oportunidad } from '../../domain/entities';
import { RegistrarActividadUseCase, type RegistrarActividadDatos } from '../registrarActividad';
import { HOY, NOW, USUARIO, empresa, foto, makeFakeRepo, oportunidad, type FakeRepo } from './fakeRepo';

const ACCION = { tipo: 'llamar' as const, detalle: null, fecha: '2026-11-03' };
const CONVERSAMOS: RegistrarActividadDatos = {
  direccion: 'saliente',
  medio: 'llamada',
  resultado: 'conversamos',
  resumen: 'Pidió cotización para 40 trabajadores.',
  proximaAccion: ACCION,
};
const NO_CONTESTO: RegistrarActividadDatos = { ...CONVERSAMOS, resultado: 'no_contesto', resumen: null };
const PENDIENTE: RegistrarActividadDatos = {
  direccion: 'entrante',
  medio: 'correo',
  resultado: 'pendiente',
  resumen: null,
  proximaAccion: { tipo: 'responder', detalle: null, fecha: HOY },
};
const RESPONDIDO: RegistrarActividadDatos = { ...PENDIENTE, resultado: 'respondido', resumen: 'Le enviamos la tarifa.' };

const useCase = (repo: FakeRepo) => new RegistrarActividadUseCase(repo.empresaRepo, repo.oportunidadRepo);
const registrar = (
  repo: FakeRepo,
  idOportunidad: string | null,
  datos: RegistrarActividadDatos,
  idEmpresa = 'e-1',
) => useCase(repo).execute(idEmpresa, idOportunidad, datos, USUARIO, HOY, new Date(NOW));

/** One empresa with one oportunidad (and optionally siblings). */
const semilla = (op: Partial<Oportunidad> = {}, hermanas: Oportunidad[] = [], ficha: Partial<Empresa> = {}) =>
  makeFakeRepo([empresa(ficha)], [], [oportunidad(op), ...hermanas]);

/** The input is rejected with `mensaje` and storage is exactly as it was. */
async function rechaza(
  datos: RegistrarActividadDatos,
  mensaje: string,
  seed: FakeRepo = semilla({ etapa: 'contactado', medio: 'llamada' }),
  idOportunidad: string | null = 'o-1',
): Promise<void> {
  const antes = foto(seed);
  const error = await registrar(seed, idOportunidad, datos).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
  expect((error as Error).message).toBe(mensaje);
  expect(foto(seed)).toEqual(antes);
  expect(seed.seguimientos).toBe(0);
}

describe('RegistrarActividadUseCase — actividad vinculada a una oportunidad (S7.4)', () => {
  it('advances Por contactar to Contactado, stores the next action and writes state + linked activity in ONE call', async () => {
    const repo = semilla();
    const { empresa: e, oportunidad: o, interaccion } = await registrar(repo, 'o-1', CONVERSAMOS);
    expect(o).toMatchObject({
      etapa: 'contactado',
      medio: 'llamada',
      medioOtro: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: null,
      proximaAccion: ACCION,
    });
    expect(repo.oportunidades[0]).toMatchObject({ etapa: 'contactado', proximaAccion: ACCION });
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: 'e-1',
      idOportunidad: 'o-1',
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'saliente',
      medio: 'llamada',
      medioOtro: null,
      resultado: 'conversamos',
      resumen: 'Pidió cotización para 40 trabajadores.',
    });
    expect(interaccion).toMatchObject({ resultado: 'conversamos', idOportunidad: 'o-1' });
    // The empresa row itself is untouched by a linked activity.
    expect(e).toEqual(empresa());
    expect(repo.seguimientos).toBe(1);
    expect(repo.escrituras).toBe(1);
  });

  it('advances ONLY the named oportunidad: a sibling deal of the same empresa is untouched (S7.4)', async () => {
    const hermana = oportunidad({ idOportunidad: 'o-2', nombre: 'Monitoreo cardiacos', etapa: 'cotizado' });
    const repo = semilla({}, [hermana]);
    await registrar(repo, 'o-1', CONVERSAMOS);
    expect(repo.oportunidades.find((o) => o.idOportunidad === 'o-2')).toEqual(hermana);
    expect(repo.oportunidades.find((o) => o.idOportunidad === 'o-1')?.etapa).toBe('contactado');
  });

  it('resets attempts, pending reply and the dismissed suggestion; keeps the stage', async () => {
    const repo = semilla({
      etapa: 'contactado',
      medio: 'correo',
      intentosSinRespuesta: 3,
      sugerenciaDescartadaEn: 3,
      faltaResponderDesde: NOW,
    });
    const { oportunidad: o } = await registrar(repo, 'o-1', CONVERSAMOS);
    expect(o).toMatchObject({
      etapa: 'contactado',
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: null,
      medio: 'llamada',
    });
  });

  it('keeps the stage of En seguimiento, Cotizado and Ganada', async () => {
    for (const etapa of ['en_seguimiento', 'cotizado', 'ganada'] as const) {
      const repo = semilla({ etapa, medio: 'llamada' });
      const { oportunidad: o } = await registrar(repo, 'o-1', CONVERSAMOS);
      expect(o?.etapa).toBe(etapa);
    }
  });

  it('requires a summary for Conversamos and Respondido, max 1000 characters', async () => {
    const MSG = 'Escribe un resumen de la conversación.';
    await rechaza({ ...CONVERSAMOS, resumen: '' }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: '   ' }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: null }, MSG);
    await rechaza({ ...RESPONDIDO, resumen: undefined }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: 'x'.repeat(1001) }, 'El resumen admite hasta 1000 caracteres.');
    const repo = semilla();
    await registrar(repo, 'o-1', { ...CONVERSAMOS, resumen: ` ${'x'.repeat(1000)} ` });
    expect(repo.interacciones[0]?.resumen).toHaveLength(1000);
  });
});

describe('RegistrarActividadUseCase — nos contactaron sobre una oportunidad', () => {
  it('"Sí, ya le respondí" (respondido) behaves like Conversamos: resets counters and the pending reply', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'correo', intentosSinRespuesta: 2, faltaResponderDesde: NOW });
    const { oportunidad: o } = await registrar(repo, 'o-1', RESPONDIDO);
    expect(o).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 0, faltaResponderDesde: null, sugerenciaDescartadaEn: null });
    expect(repo.interacciones[0]).toMatchObject({ direccion: 'entrante', resultado: 'respondido', resumen: 'Le enviamos la tarifa.' });
  });

  it('"Todavía no" (pendiente): pending reply since now, attempts back to 0, Por contactar → Contactado, summary optional', async () => {
    const repo = semilla();
    const { oportunidad: o } = await registrar(repo, 'o-1', PENDIENTE);
    expect(o).toMatchObject({ etapa: 'contactado', faltaResponderDesde: NOW, intentosSinRespuesta: 0, medio: 'correo' });
    expect(repo.interacciones[0]).toMatchObject({ direccion: 'entrante', resultado: 'pendiente', resumen: null });
  });

  it('pendiente also resets attempts and the dismissed suggestion of a card that had failed attempts', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 3, sugerenciaDescartadaEn: 3 });
    const { oportunidad: o } = await registrar(repo, 'o-1', PENDIENTE);
    expect(o).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 0, sugerenciaDescartadaEn: null });
  });
});

describe('RegistrarActividadUseCase — failed attempts', () => {
  it('No contestó on Por contactar moves to Contactado with 1 attempt; summary optional', async () => {
    const repo = semilla();
    const { oportunidad: o } = await registrar(repo, 'o-1', NO_CONTESTO);
    expect(o).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 1, faltaResponderDesde: null });
    expect(repo.interacciones[0]).toMatchObject({ resultado: 'no_contesto', resumen: null });
  });

  it('Dejé mensaje adds one attempt and the card stays where it is', async () => {
    for (const etapa of ['contactado', 'en_seguimiento', 'cotizado', 'ganada'] as const) {
      const repo = semilla({ etapa, medio: 'llamada', intentosSinRespuesta: 1 });
      const { oportunidad: o } = await registrar(repo, 'o-1', { ...NO_CONTESTO, resultado: 'deje_mensaje' });
      expect(o).toMatchObject({ etapa, intentosSinRespuesta: 2 });
    }
  });

  it('keeps the pending reply and the dismissed suggestion; the suggestion shows again after one more attempt', async () => {
    const repo = semilla({
      etapa: 'contactado',
      medio: 'llamada',
      intentosSinRespuesta: 3,
      sugerenciaDescartadaEn: 3,
      faltaResponderDesde: NOW,
    });
    const { oportunidad: o } = await registrar(repo, 'o-1', NO_CONTESTO);
    expect(o).toMatchObject({ intentosSinRespuesta: 4, sugerenciaDescartadaEn: 3, faltaResponderDesde: NOW });
  });

  it('never moves the card to Perdida by itself, however many attempts', async () => {
    const repo = semilla({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 7 });
    const { oportunidad: o } = await registrar(repo, 'o-1', NO_CONTESTO);
    expect(o).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 8, motivo: null });
  });
});

describe('RegistrarActividadUseCase — medium', () => {
  it('Otro requires "¿Cuál?"', async () => {
    await rechaza({ ...CONVERSAMOS, medio: 'otro' }, 'Escribe cuál fue el medio.');
    await rechaza({ ...CONVERSAMOS, medio: 'otro', medioOtro: '   ' }, 'Escribe cuál fue el medio.');
    await rechaza({ ...CONVERSAMOS, medio: 'otro', medioOtro: 'x'.repeat(41) }, 'El medio admite hasta 40 caracteres.');
  });

  it('stores the free text on the oportunidad and the activity only for Otro', async () => {
    const repo = semilla();
    const { oportunidad: o } = await registrar(repo, 'o-1', { ...CONVERSAMOS, medio: 'otro', medioOtro: ' Feria ' });
    expect(o).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    expect(repo.interacciones[0]).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    const repo2 = semilla();
    await registrar(repo2, 'o-1', { ...CONVERSAMOS, medio: 'correo', medioOtro: 'ignorado' });
    expect(repo2.oportunidades[0]?.medioOtro).toBeNull();
    expect(repo2.interacciones[0]?.medioOtro).toBeNull();
  });

  it('rejects an unknown medium', async () => {
    await rechaza({ ...CONVERSAMOS, medio: 'paloma' }, 'Elige el medio de contacto: llamada, correo o WhatsApp');
  });
});

describe('RegistrarActividadUseCase — next action', () => {
  const ELIGE = 'Elige la próxima acción.';

  it('is required while the deal is open (not Ganada/Perdida)', async () => {
    await rechaza({ ...CONVERSAMOS, proximaAccion: null }, ELIGE);
    await rechaza({ ...CONVERSAMOS, proximaAccion: undefined }, ELIGE);
    await rechaza({ ...NO_CONTESTO, proximaAccion: null }, ELIGE, semilla());
    await rechaza(
      { ...CONVERSAMOS, proximaAccion: null },
      ELIGE,
      semilla({ etapa: 'en_seguimiento', medio: 'llamada' }),
    );
    await rechaza(
      { ...CONVERSAMOS, proximaAccion: null },
      ELIGE,
      semilla({ etapa: 'cotizado', medio: 'correo' }),
    );
  });

  it('on a Ganada card the next action is optional: null clears it, a given one is stored', async () => {
    const repo = semilla({ etapa: 'ganada', medio: 'llamada', proximaAccion: ACCION });
    const { oportunidad: o } = await registrar(repo, 'o-1', { ...CONVERSAMOS, proximaAccion: null });
    expect(o?.proximaAccion).toBeNull();
    const repo2 = semilla({ etapa: 'ganada', medio: 'llamada' });
    const { oportunidad: o2 } = await registrar(repo2, 'o-1', CONVERSAMOS);
    expect(o2?.proximaAccion).toEqual(ACCION);
  });

  it('rejects an unknown type, Otro without detail, a malformed date and a past date', async () => {
    await rechaza({ ...CONVERSAMOS, proximaAccion: { tipo: 'bailar', fecha: HOY } }, ELIGE);
    await rechaza({ ...CONVERSAMOS, proximaAccion: { tipo: 'otro', detalle: ' ', fecha: HOY } }, 'Escribe cuál es la próxima acción.');
    await rechaza({ ...CONVERSAMOS, proximaAccion: { tipo: 'llamar', fecha: '03/11/2026' } }, 'Elige la fecha de la próxima acción.');
    await rechaza({ ...CONVERSAMOS, proximaAccion: { tipo: 'llamar', fecha: '2026-02-31' } }, 'Elige la fecha de la próxima acción.');
    await rechaza({ ...CONVERSAMOS, proximaAccion: { tipo: 'llamar', fecha: '2026-10-30' } }, 'La fecha de la próxima acción no puede ser pasada.');
    await rechaza(
      { ...CONVERSAMOS, proximaAccion: { tipo: 'llamar', detalle: 'x'.repeat(81), fecha: HOY } },
      'El detalle de la próxima acción admite hasta 80 caracteres.',
    );
  });

  it('accepts today, trims the detail and stores Otro with its detail', async () => {
    const repo = semilla();
    const { oportunidad: o } = await registrar(repo, 'o-1', { ...CONVERSAMOS, proximaAccion: { tipo: 'otro', detalle: ' Visitar planta ', fecha: HOY } });
    expect(o?.proximaAccion).toEqual({ tipo: 'otro', detalle: 'Visitar planta', fecha: HOY });
  });
});

describe('RegistrarActividadUseCase — tarjeta cerrada y ownership', () => {
  it('rejects a Perdida card', async () => {
    await rechaza(
      CONVERSAMOS,
      'No se puede registrar una actividad en una oportunidad en Perdida.',
      semilla({
        etapa: 'perdida',
        medio: 'llamada',
        motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null },
      }),
    );
  });

  it('the oportunidad must belong to the empresa: OportunidadDeOtraEmpresaError, stores nothing', async () => {
    const otraEmpresa = empresa({ idEmpresa: 'e-2', razonSocial: 'Otra S.A.C.' });
    const ajena = oportunidad({ idOportunidad: 'o-9', idEmpresa: 'e-2', etapa: 'contactado', medio: 'llamada' });
    const repo = makeFakeRepo([empresa(), otraEmpresa], [], [ajena]);
    const antes = foto(repo);
    const error = await registrar(repo, 'o-9', CONVERSAMOS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OportunidadDeOtraEmpresaError);
    expect((error as Error).message).toBe('La oportunidad no pertenece a esta empresa');
    expect(foto(repo)).toEqual(antes);
    expect(repo.seguimientos).toBe(0);
  });

  it('rejects a result that does not belong to the direction, and unknown values', async () => {
    const MSG = 'El resultado no corresponde a la dirección del contacto.';
    await rechaza({ ...CONVERSAMOS, resultado: 'pendiente' }, MSG);
    await rechaza({ ...CONVERSAMOS, resultado: 'respondido' }, MSG);
    await rechaza({ ...PENDIENTE, resultado: 'no_contesto' }, MSG);
    await rechaza({ ...PENDIENTE, resultado: 'conversamos' }, MSG);
    await rechaza({ ...CONVERSAMOS, resultado: 'zzz' }, 'Elige el resultado del contacto.');
    await rechaza({ ...CONVERSAMOS, direccion: 'lateral' }, 'Elige si contactamos nosotros o nos contactaron.');
  });

  it('throws OportunidadNotFoundError for an unknown oportunidad and writes nothing', async () => {
    const repo = semilla();
    await expect(registrar(repo, 'nope', CONVERSAMOS)).rejects.toBeInstanceOf(OportunidadNotFoundError);
    expect(repo.escrituras).toBe(0);
  });

  it('throws EmpresaNotFoundError for an unknown empresa', async () => {
    const repo = semilla();
    await expect(registrar(repo, null, CONVERSAMOS, 'nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
    expect(repo.escrituras).toBe(0);
  });
});

describe('RegistrarActividadUseCase — actividad general sin oportunidad (S6.4)', () => {
  it('writes ONLY the history entry of the empresa and touches no oportunidad', async () => {
    const hermana = oportunidad({ idOportunidad: 'o-2', etapa: 'contactado', medio: 'correo' });
    const repo = semilla({}, [hermana]);
    const antes = foto(repo);
    const { empresa: e, oportunidad: o, interaccion } = await registrar(repo, null, {
      direccion: 'saliente',
      medio: 'llamada',
      resultado: 'conversamos',
      resumen: 'Consulta general de facturación.',
      proximaAccion: null,
    });
    expect(o).toBeNull();
    expect(e).toEqual(empresa());
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: 'e-1',
      idOportunidad: null,
      resultado: 'conversamos',
      resumen: 'Consulta general de facturación.',
    });
    // The general activity advanced no deal and wrote no follow-up state.
    expect(foto(repo).oportunidades).toEqual(antes.oportunidades);
    expect(repo.seguimientos).toBe(0);
    expect(repo.escrituras).toBe(1);
  });

  it('a general activity does NOT require a next action (no deal to advance)', async () => {
    const repo = semilla();
    const { interaccion } = await registrar(repo, null, { ...CONVERSAMOS, proximaAccion: null });
    expect(interaccion.resultado).toBe('conversamos');
    expect(repo.oportunidades[0]?.proximaAccion).toBeNull();
  });

  it('still validates direction, result, medium and summary', async () => {
    const repo = semilla();
    const antes = foto(repo);
    await expect(
      registrar(repo, null, { ...CONVERSAMOS, resultado: 'pendiente' }),
    ).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(registrar(repo, null, { ...CONVERSAMOS, resumen: 'x'.repeat(1001) })).rejects.toThrow(
      'El resumen admite hasta 1000 caracteres.',
    );
    await expect(registrar(repo, null, { ...CONVERSAMOS, medio: 'otro' })).rejects.toThrow('Escribe cuál fue el medio.');
    expect(foto(repo)).toEqual(antes);
  });

  it('a rejected input stores nothing', async () => {
    const repo = semilla();
    const antes = foto(repo);
    await expect(registrar(repo, null, { ...CONVERSAMOS, resumen: null })).rejects.toBeInstanceOf(
      DatosEmpresaInvalidosError,
    );
    expect(foto(repo)).toEqual(antes);
  });
});
