import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError } from '../../domain/errors';
import { RegistrarEntranteUseCase, type RegistrarEntranteDatos } from '../registrarEntrante';
import { HOY, NOW, USUARIO, empresa, foto, makeFakeRepo, type FakeRepo } from './fakeRepo';

const ACCION = { tipo: 'responder', detalle: null, fecha: HOY };
const DATOS: RegistrarEntranteDatos = {
  razonSocial: 'Textiles Pacífico S.A.C.',
  medio: 'whatsapp',
  persona: 'Rosa Mendoza',
  telefono: '987 111 222',
  correo: 'rosa@pacifico.pe',
  ruc: '20556677889',
  necesita: 'Exámenes ocupacionales para 25 personas.',
  origen: 'referido',
  proximaAccion: ACCION,
};

const entrante = (repo: FakeRepo, datos: RegistrarEntranteDatos) =>
  new RegistrarEntranteUseCase(repo).execute(datos, USUARIO, HOY, new Date(NOW));

async function rechaza(datos: RegistrarEntranteDatos, mensaje: string, seed = [empresa()]): Promise<void> {
  const repo = makeFakeRepo(seed);
  const antes = foto(repo);
  const error = await entrante(repo, datos).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
  expect((error as Error).message).toBe(mensaje);
  expect(foto(repo)).toEqual(antes);
}

describe('RegistrarEntranteUseCase — new empresa (L8, S5, S6)', () => {
  it('creates the empresa straight in Contactado with Falta responder, the origin, one contact and the first interaction', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, DATOS);
    expect(r.existente).toBe(false);
    expect(r.empresa).toMatchObject({
      razonSocial: 'Textiles Pacífico S.A.C.',
      ruc: '20556677889',
      sector: null,
      etapa: 'contactado',
      medio: 'whatsapp',
      medioOtro: null,
      origen: 'referido',
      intentosSinRespuesta: 0,
      faltaResponderDesde: NOW,
      sugerenciaDescartadaEn: null,
      proximaAccion: ACCION,
      contactos: [{ nombre: 'Rosa Mendoza', telefono: '987 111 222', correo: 'rosa@pacifico.pe' }],
    });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ etapa: 'contactado', faltaResponderDesde: NOW, origen: 'referido' });
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: r.empresa.idEmpresa,
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'entrante',
      medio: 'whatsapp',
      resultado: 'pendiente',
      resumen: 'Exámenes ocupacionales para 25 personas.',
    });
    // create + updateSeguimiento: two writes (not atomic, documented in the use case).
    expect(repo.escrituras).toBe(2);
    expect(repo.seguimientos).toBe(1);
  });

  it('accepts a card without RUC ("Falta RUC"), without person and without need or origin', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, {
      razonSocial: 'Gráfica Sur',
      medio: 'correo',
      correo: 'info@sur.pe',
      proximaAccion: ACCION,
    });
    expect(r.empresa).toMatchObject({
      ruc: null,
      origen: null,
      contactos: [{ nombre: null, telefono: null, correo: 'info@sur.pe' }],
    });
    expect(repo.interacciones[0]?.resumen).toBeNull();
  });

  it('phone or email is required', async () => {
    const MSG = 'Escribe un teléfono o un correo.';
    await rechaza({ ...DATOS, telefono: '', correo: '' }, MSG, []);
    await rechaza({ ...DATOS, telefono: undefined, correo: undefined }, MSG, []);
    await rechaza({ ...DATOS, telefono: '  ', correo: null }, MSG, []);
  });

  it('a phone, when given, has 9 digits; an email, when given, is valid', async () => {
    await rechaza({ ...DATOS, telefono: '12345' }, 'El teléfono debe tener 9 dígitos.', []);
    await rechaza({ ...DATOS, correo: 'sin-arroba' }, 'El correo no es válido.', []);
    const repo = makeFakeRepo();
    await entrante(repo, { ...DATOS, telefono: '987-111-222', correo: null });
    expect(repo.rows[0]?.contactos[0]?.telefono).toBe('987-111-222');
  });

  it('the RUC, when given, has 11 digits', async () => {
    await rechaza({ ...DATOS, ruc: '2055' }, 'El RUC debe tener 11 dígitos.', []);
    await rechaza({ ...DATOS, ruc: '2055667788A' }, 'El RUC debe tener 11 dígitos.', []);
  });

  it('requires the company name and a valid medium; Otro requires "¿Cuál?"', async () => {
    await rechaza({ ...DATOS, razonSocial: '  ' }, 'La razón social es obligatoria', []);
    await rechaza({ ...DATOS, medio: 'paloma' }, 'Elige el medio de contacto: llamada, correo o WhatsApp', []);
    await rechaza({ ...DATOS, medio: 'otro' }, 'Escribe cuál fue el medio.', []);
    const repo = makeFakeRepo();
    const r = await entrante(repo, { ...DATOS, medio: 'otro', medioOtro: 'Feria' });
    expect(r.empresa).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    expect(repo.interacciones[0]).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
  });

  it('validates the origin, the "¿Qué necesita?" length and the next action; all of them store nothing', async () => {
    await rechaza({ ...DATOS, origen: 'zzz' }, 'Elige cómo nos conoció.', []);
    await rechaza({ ...DATOS, necesita: 'x'.repeat(1001) }, 'El resumen admite hasta 1000 caracteres.', []);
    await rechaza({ ...DATOS, proximaAccion: null }, 'Elige la próxima acción.', []);
    await rechaza({ ...DATOS, proximaAccion: { tipo: 'llamar', fecha: '2026-10-30' } }, 'La fecha de la próxima acción no puede ser pasada.', []);
  });
});

describe('RegistrarEntranteUseCase — existing empresa (L8, S5)', () => {
  const SEED = empresa({
    razonSocial: 'Textiles Pacífico S.A.C.',
    ruc: '20556677889',
    etapa: 'por_contactar',
    proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-20' },
  });

  it('a name match (case- and space-insensitive) adds the contact to that empresa instead of creating one', async () => {
    const repo = makeFakeRepo([empresa({ razonSocial: 'Textiles Pacífico S.A.C.', ruc: null })]);
    const r = await entrante(repo, { ...DATOS, razonSocial: '  TEXTILES   pacífico s.a.c. ', ruc: '' });
    expect(r.existente).toBe(true);
    expect(r.empresa.idEmpresa).toBe('e-1');
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      etapa: 'contactado',
      medio: 'whatsapp',
      faltaResponderDesde: NOW,
      intentosSinRespuesta: 0,
      proximaAccion: ACCION,
    });
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: 'e-1',
      direccion: 'entrante',
      resultado: 'pendiente',
      resumen: 'Exámenes ocupacionales para 25 personas.',
      idUsuario: 'u-1',
    });
    expect(repo.seguimientos).toBe(1);
    expect(repo.escrituras).toBe(1);
  });

  it('an existing RUC adds the contact to the empresa that holds it, whatever the name', async () => {
    const repo = makeFakeRepo([SEED]);
    const r = await entrante(repo, { ...DATOS, razonSocial: 'Otro nombre comercial' });
    expect(r.existente).toBe(true);
    expect(r.empresa.idEmpresa).toBe('e-1');
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.razonSocial).toBe('Textiles Pacífico S.A.C.');
  });

  it('the next action is replaced, the stage of En seguimiento/Cliente is kept and the attempts reset', async () => {
    const repo = makeFakeRepo([
      { ...SEED, etapa: 'en_seguimiento', medio: 'llamada', intentosSinRespuesta: 2, sugerenciaDescartadaEn: 3 },
    ]);
    const r = await entrante(repo, DATOS);
    expect(r.empresa).toMatchObject({
      etapa: 'en_seguimiento',
      intentosSinRespuesta: 0,
      sugerenciaDescartadaEn: null,
      faltaResponderDesde: NOW,
      proximaAccion: ACCION,
    });
  });

  it('an inbound contact on a Cliente card may leave the next action empty', async () => {
    const repo = makeFakeRepo([{ ...SEED, etapa: 'cliente', medio: 'llamada' }]);
    const r = await entrante(repo, { ...DATOS, proximaAccion: null });
    expect(r.empresa).toMatchObject({ etapa: 'cliente', proximaAccion: null });
  });

  it('does not duplicate the person: a new contact is not added to the card (history only)', async () => {
    const repo = makeFakeRepo([SEED]);
    await entrante(repo, DATOS);
    expect(repo.rows[0]?.contactos).toHaveLength(1);
  });

  it('rejects a Perdido card and stores nothing', async () => {
    await rechaza(
      DATOS,
      'No se puede registrar un contacto en una empresa en Perdido.',
      [empresa({ ...SEED, etapa: 'perdido', medio: 'llamada', motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null } })],
    );
  });

  it('input rejected on an existing empresa leaves rows and counters unchanged', async () => {
    await rechaza({ ...DATOS, telefono: '', correo: '' }, 'Escribe un teléfono o un correo.', [SEED]);
    await rechaza({ ...DATOS, proximaAccion: null }, 'Elige la próxima acción.', [SEED]);
  });
});

describe('RegistrarEntranteUseCase — sector (S12)', () => {
  it('a new card takes the sector, resolved case-insensitively to the stored name', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, { ...DATOS, sector: '  comercio y tiendas ' });
    expect(r.existente).toBe(false);
    expect(r.empresa.sector).toBe('Comercio y Tiendas');
    expect(repo.rows[0]?.sector).toBe('Comercio y Tiendas');
  });

  it('without sector (or blank) the card keeps "Sin definir"', async () => {
    const repo = makeFakeRepo();
    await entrante(repo, { ...DATOS, sector: '   ' });
    expect(repo.rows[0]?.sector).toBeNull();
  });

  it('an existing empresa ignores the sector, even an unknown one', async () => {
    const repo = makeFakeRepo([empresa({ razonSocial: 'Textiles Pacífico S.A.C.', ruc: null, sector: 'Construcción' })]);
    const r = await entrante(repo, { ...DATOS, ruc: '', sector: 'Astrología' });
    expect(r.existente).toBe(true);
    expect(r.empresa.sector).toBe('Construcción');
    expect(repo.rows[0]?.sector).toBe('Construcción');
  });

  it('an unknown sector is rejected BEFORE any write', async () => {
    await rechaza({ ...DATOS, sector: 'Astrología' }, 'Sector desconocido: Astrología', []);
  });
});
