import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError, EmpresaNotFoundError } from '../../domain/errors';
import type { Empresa } from '../../domain/entities';
import { RegistrarContactoUseCase, type RegistrarContactoDatos } from '../registrarContacto';
import { HOY, NOW, USUARIO, empresa, foto, makeFakeRepo, type FakeRepo } from './fakeRepo';

const ACCION = { tipo: 'llamar' as const, detalle: null, fecha: '2026-11-03' };
const CONVERSAMOS: RegistrarContactoDatos = {
  direccion: 'saliente',
  medio: 'llamada',
  resultado: 'conversamos',
  resumen: 'Pidió cotización para 40 trabajadores.',
  proximaAccion: ACCION,
};
const NO_CONTESTO: RegistrarContactoDatos = { ...CONVERSAMOS, resultado: 'no_contesto', resumen: null };
const PENDIENTE: RegistrarContactoDatos = {
  direccion: 'entrante',
  medio: 'correo',
  resultado: 'pendiente',
  resumen: null,
  proximaAccion: { tipo: 'responder', detalle: null, fecha: HOY },
};
const RESPONDIDO: RegistrarContactoDatos = { ...PENDIENTE, resultado: 'respondido', resumen: 'Le enviamos la tarifa.' };

const registrar = (repo: FakeRepo, datos: RegistrarContactoDatos, id = 'e-1') =>
  new RegistrarContactoUseCase(repo).execute(id, datos, USUARIO, HOY, new Date(NOW));

/** The input is rejected with `mensaje` and storage is exactly as it was. */
async function rechaza(
  datos: RegistrarContactoDatos,
  mensaje: string,
  seed: Empresa = empresa({ etapa: 'contactado', medio: 'llamada' }),
): Promise<void> {
  const repo = makeFakeRepo([seed]);
  const antes = foto(repo);
  const error = await registrar(repo, datos).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
  expect((error as Error).message).toBe(mensaje);
  expect(foto(repo)).toEqual(antes);
  expect(repo.seguimientos).toBe(0);
}

describe('RegistrarContactoUseCase — Contactamos + Conversamos (L8)', () => {
  it('moves Por contactar to Contactado, stores the next action and writes state + interaction in ONE call', async () => {
    const repo = makeFakeRepo([empresa()]);
    const { empresa: e, interaccion } = await registrar(repo, CONVERSAMOS);
    expect(e).toMatchObject({
      etapa: 'contactado',
      medio: 'llamada',
      medioOtro: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: null,
      proximaAccion: ACCION,
    });
    expect(repo.rows[0]).toMatchObject({ etapa: 'contactado', proximaAccion: ACCION });
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: 'e-1',
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'saliente',
      medio: 'llamada',
      medioOtro: null,
      resultado: 'conversamos',
      resumen: 'Pidió cotización para 40 trabajadores.',
    });
    expect(interaccion).toMatchObject({ resultado: 'conversamos', idUsuario: 'u-1' });
    expect(repo.seguimientos).toBe(1);
    expect(repo.escrituras).toBe(1);
  });

  it('resets attempts, pending reply and the dismissed suggestion; stays in Contactado', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'contactado', medio: 'correo', intentosSinRespuesta: 3, sugerenciaDescartadaEn: 3, faltaResponderDesde: NOW }),
    ]);
    const { empresa: e } = await registrar(repo, CONVERSAMOS);
    expect(e).toMatchObject({
      etapa: 'contactado',
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: null,
      medio: 'llamada',
    });
  });

  it('keeps the column when the card is already in En seguimiento or Cliente', async () => {
    for (const etapa of ['en_seguimiento', 'cliente'] as const) {
      const repo = makeFakeRepo([empresa({ etapa, medio: 'llamada' })]);
      const { empresa: e } = await registrar(repo, CONVERSAMOS);
      expect(e.etapa).toBe(etapa);
    }
  });

  it('requires a summary for Conversamos and Respondido, max 1000 characters', async () => {
    const MSG = 'Escribe un resumen de la conversación.';
    await rechaza({ ...CONVERSAMOS, resumen: '' }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: '   ' }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: null }, MSG);
    await rechaza({ ...RESPONDIDO, resumen: undefined }, MSG);
    await rechaza({ ...CONVERSAMOS, resumen: 'x'.repeat(1001) }, 'El resumen admite hasta 1000 caracteres.');
    const repo = makeFakeRepo([empresa()]);
    await registrar(repo, { ...CONVERSAMOS, resumen: ` ${'x'.repeat(1000)} ` });
    expect(repo.interacciones[0]?.resumen).toHaveLength(1000);
  });
});

describe('RegistrarContactoUseCase — Nos contactaron on an existing card (L8)', () => {
  it('"Sí, ya le respondí" (respondido) behaves like Conversamos: resets counters and the pending reply', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'contactado', medio: 'correo', intentosSinRespuesta: 2, faltaResponderDesde: NOW }),
    ]);
    const { empresa: e } = await registrar(repo, RESPONDIDO);
    expect(e).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 0, faltaResponderDesde: null, sugerenciaDescartadaEn: null });
    expect(repo.interacciones[0]).toMatchObject({ direccion: 'entrante', resultado: 'respondido', resumen: 'Le enviamos la tarifa.' });
  });

  it('"Todavía no" (pendiente): pending reply since now, attempts back to 0, Por contactar → Contactado, summary optional', async () => {
    const repo = makeFakeRepo([empresa({ intentosSinRespuesta: 0 })]);
    const { empresa: e } = await registrar(repo, PENDIENTE);
    expect(e).toMatchObject({ etapa: 'contactado', faltaResponderDesde: NOW, intentosSinRespuesta: 0, medio: 'correo' });
    expect(repo.interacciones[0]).toMatchObject({ direccion: 'entrante', resultado: 'pendiente', resumen: null });
  });

  it('pendiente also resets attempts and the dismissed suggestion of a card that had failed attempts', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 3, sugerenciaDescartadaEn: 3 })]);
    const { empresa: e } = await registrar(repo, PENDIENTE);
    expect(e).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 0, sugerenciaDescartadaEn: null });
  });
});

describe('RegistrarContactoUseCase — failed attempts (L8, S2, S3)', () => {
  it('No contestó on Por contactar moves to Contactado with 1 attempt; summary optional', async () => {
    const repo = makeFakeRepo([empresa()]);
    const { empresa: e } = await registrar(repo, NO_CONTESTO);
    expect(e).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 1, faltaResponderDesde: null });
    expect(repo.interacciones[0]).toMatchObject({ resultado: 'no_contesto', resumen: null });
  });

  it('Dejé mensaje adds one attempt and the card stays where it is', async () => {
    for (const etapa of ['contactado', 'en_seguimiento', 'cliente'] as const) {
      const repo = makeFakeRepo([empresa({ etapa, medio: 'llamada', intentosSinRespuesta: 1 })]);
      const { empresa: e } = await registrar(repo, { ...NO_CONTESTO, resultado: 'deje_mensaje' });
      expect(e).toMatchObject({ etapa, intentosSinRespuesta: 2 });
    }
  });

  it('keeps the pending reply and the dismissed suggestion; the suggestion shows again after one more attempt', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 3, sugerenciaDescartadaEn: 3, faltaResponderDesde: NOW }),
    ]);
    const { empresa: e } = await registrar(repo, NO_CONTESTO);
    expect(e).toMatchObject({ intentosSinRespuesta: 4, sugerenciaDescartadaEn: 3, faltaResponderDesde: NOW });
  });

  it('never moves the card to Perdido by itself, however many attempts', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 7 })]);
    const { empresa: e } = await registrar(repo, NO_CONTESTO);
    expect(e).toMatchObject({ etapa: 'contactado', intentosSinRespuesta: 8, motivo: null });
  });
});

describe('RegistrarContactoUseCase — medium (S7)', () => {
  it('Otro requires "¿Cuál?"', async () => {
    await rechaza({ ...CONVERSAMOS, medio: 'otro' }, 'Escribe cuál fue el medio.');
    await rechaza({ ...CONVERSAMOS, medio: 'otro', medioOtro: '   ' }, 'Escribe cuál fue el medio.');
    await rechaza({ ...CONVERSAMOS, medio: 'otro', medioOtro: 'x'.repeat(41) }, 'El medio admite hasta 40 caracteres.');
  });

  it('stores the free text on the empresa and the interaction only for Otro', async () => {
    const repo = makeFakeRepo([empresa()]);
    const { empresa: e } = await registrar(repo, { ...CONVERSAMOS, medio: 'otro', medioOtro: ' Feria ' });
    expect(e).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    expect(repo.interacciones[0]).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    const repo2 = makeFakeRepo([empresa()]);
    await registrar(repo2, { ...CONVERSAMOS, medio: 'correo', medioOtro: 'ignorado' });
    expect(repo2.rows[0]?.medioOtro).toBeNull();
    expect(repo2.interacciones[0]?.medioOtro).toBeNull();
  });

  it('rejects an unknown medium', async () => {
    await rechaza({ ...CONVERSAMOS, medio: 'paloma' }, 'Elige el medio de contacto: llamada, correo o WhatsApp');
  });
});

describe('RegistrarContactoUseCase — next action (S8, L8)', () => {
  const ELIGE = 'Elige la próxima acción.';

  it('is required outside Cliente and Perdido', async () => {
    await rechaza({ ...CONVERSAMOS, proximaAccion: null }, ELIGE);
    await rechaza({ ...CONVERSAMOS, proximaAccion: undefined }, ELIGE);
    await rechaza({ ...NO_CONTESTO, proximaAccion: null }, ELIGE, empresa());
    await rechaza({ ...CONVERSAMOS, proximaAccion: null }, ELIGE, empresa({ etapa: 'en_seguimiento', medio: 'llamada' }));
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
    const repo = makeFakeRepo([empresa()]);
    const { empresa: e } = await registrar(repo, { ...CONVERSAMOS, proximaAccion: { tipo: 'otro', detalle: ' Visitar planta ', fecha: HOY } });
    expect(e.proximaAccion).toEqual({ tipo: 'otro', detalle: 'Visitar planta', fecha: HOY });
  });

  it('in Cliente, "Sin próxima acción" (null) clears the stored one; a given one is stored', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'cliente', medio: 'llamada', proximaAccion: ACCION })]);
    const { empresa: e } = await registrar(repo, { ...CONVERSAMOS, proximaAccion: null });
    expect(e.proximaAccion).toBeNull();
    const repo2 = makeFakeRepo([empresa({ etapa: 'cliente', medio: 'llamada' })]);
    const { empresa: e2 } = await registrar(repo2, CONVERSAMOS);
    expect(e2.proximaAccion).toEqual(ACCION);
  });
});

describe('RegistrarContactoUseCase — rejections store nothing', () => {
  it('rejects a Perdido card', async () => {
    await rechaza(CONVERSAMOS, 'No se puede registrar un contacto en una empresa en Perdido.', empresa({ etapa: 'perdido', medio: 'llamada', motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null } }));
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

  it('throws not found for an unknown empresa and writes nothing', async () => {
    const repo = makeFakeRepo();
    await expect(registrar(repo, CONVERSAMOS, 'nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
    expect(repo.escrituras).toBe(0);
  });
});
