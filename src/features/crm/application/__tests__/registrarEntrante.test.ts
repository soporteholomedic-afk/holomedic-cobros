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
  new RegistrarEntranteUseCase(repo.empresaRepo, repo.oportunidadRepo).execute(datos, USUARIO, HOY, new Date(NOW));

async function rechaza(datos: RegistrarEntranteDatos, mensaje: string, seed: FakeRepo = makeFakeRepo([empresa()])): Promise<void> {
  const antes = foto(seed);
  const error = await entrante(seed, datos).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
  expect((error as Error).message).toBe(mensaje);
  expect(foto(seed)).toEqual(antes);
}

describe('RegistrarEntranteUseCase — empresa nueva con su primera oportunidad (S4)', () => {
  it('creates the ficha as Prospecto AND its first oportunidad in Contactado, with the linked activity', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, DATOS);
    expect(r.existente).toBe(false);
    expect(r.empresa).toMatchObject({
      razonSocial: 'Textiles Pacífico S.A.C.',
      ruc: '20556677889',
      sector: null,
      relacion: 'prospecto',
      contactos: [{ nombre: 'Rosa Mendoza', telefono: '987 111 222', correo: 'rosa@pacifico.pe' }],
    });
    expect(r.oportunidad).toMatchObject({
      idEmpresa: r.empresa.idEmpresa,
      nombre: 'Exámenes ocupacionales para 25 personas.',
      etapa: 'contactado',
      medio: 'whatsapp',
      medioOtro: null,
      origen: 'referido',
      responsableId: null,
      responsableNombre: null,
      servicio: null,
      montoEstimado: null,
      motivo: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: NOW,
      sugerenciaDescartadaEn: null,
      proximaAccion: ACCION,
    });
    expect(repo.rows).toHaveLength(1);
    expect(repo.oportunidades).toHaveLength(1);
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: r.empresa.idEmpresa,
      idOportunidad: r.oportunidad?.idOportunidad,
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'entrante',
      medio: 'whatsapp',
      resultado: 'pendiente',
      resumen: 'Exámenes ocupacionales para 25 personas.',
    });
    // create empresa + create oportunidad + updateSeguimiento: three writes (not atomic, documented in the use case).
    expect(repo.escrituras).toBe(3);
    expect(repo.seguimientos).toBe(1);
  });

  it('without "¿Qué necesita?" the deal is named "Negocio entrante"', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, {
      razonSocial: 'Gráfica Sur',
      medio: 'correo',
      correo: 'info@sur.pe',
      proximaAccion: ACCION,
    });
    expect(r.oportunidad).toMatchObject({ nombre: 'Negocio entrante', etapa: 'contactado', origen: null, medio: 'correo' });
    expect(r.empresa).toMatchObject({ ruc: null, contactos: [{ nombre: null, telefono: null, correo: 'info@sur.pe' }] });
    expect(repo.interacciones[0]?.resumen).toBeNull();
  });

  it('a long "¿Qué necesita?" names the deal with its first 120 characters and stores the full summary', async () => {
    const repo = makeFakeRepo();
    const largo = 'x'.repeat(300);
    const r = await entrante(repo, { ...DATOS, necesita: largo });
    expect(r.oportunidad?.nombre).toHaveLength(120);
    expect(repo.interacciones[0]?.resumen).toHaveLength(300);
  });

  it('phone or email is required', async () => {
    const MSG = 'Escribe un teléfono o un correo.';
    await rechaza({ ...DATOS, telefono: '', correo: '' }, MSG, makeFakeRepo());
    await rechaza({ ...DATOS, telefono: undefined, correo: undefined }, MSG, makeFakeRepo());
    await rechaza({ ...DATOS, telefono: '  ', correo: null }, MSG, makeFakeRepo());
  });

  it('a phone, when given, has 9 digits; an email, when given, is valid', async () => {
    await rechaza({ ...DATOS, telefono: '12345' }, 'El teléfono debe tener 9 dígitos.', makeFakeRepo());
    await rechaza({ ...DATOS, correo: 'sin-arroba' }, 'El correo no es válido.', makeFakeRepo());
    const repo = makeFakeRepo();
    await entrante(repo, { ...DATOS, telefono: '987-111-222', correo: null });
    expect(repo.rows[0]?.contactos[0]?.telefono).toBe('987-111-222');
  });

  it('the RUC, when given, has 11 digits', async () => {
    await rechaza({ ...DATOS, ruc: '2055' }, 'El RUC debe tener 11 dígitos.', makeFakeRepo());
    await rechaza({ ...DATOS, ruc: '2055667788A' }, 'El RUC debe tener 11 dígitos.', makeFakeRepo());
  });

  it('requires the company name and a valid medium; Otro requires "¿Cuál?"', async () => {
    await rechaza({ ...DATOS, razonSocial: '  ' }, 'La razón social es obligatoria', makeFakeRepo());
    await rechaza({ ...DATOS, medio: 'paloma' }, 'Elige el medio de contacto: llamada, correo o WhatsApp', makeFakeRepo());
    await rechaza({ ...DATOS, medio: 'otro' }, 'Escribe cuál fue el medio.', makeFakeRepo());
    const repo = makeFakeRepo();
    const r = await entrante(repo, { ...DATOS, medio: 'otro', medioOtro: 'Feria' });
    expect(r.oportunidad).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
    expect(repo.interacciones[0]).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
  });

  it('validates the origin, the "¿Qué necesita?" length and the next action; all of them store nothing', async () => {
    await rechaza({ ...DATOS, origen: 'zzz' }, 'Elige cómo nos conoció.', makeFakeRepo());
    await rechaza({ ...DATOS, necesita: 'x'.repeat(1001) }, 'El resumen admite hasta 1000 caracteres.', makeFakeRepo());
    await rechaza({ ...DATOS, proximaAccion: null }, 'Elige la próxima acción.', makeFakeRepo());
    await rechaza(
      { ...DATOS, proximaAccion: { tipo: 'llamar', fecha: '2026-10-30' } },
      'La fecha de la próxima acción no puede ser pasada.',
      makeFakeRepo(),
    );
  });
});

describe('RegistrarEntranteUseCase — empresa existente: nueva oportunidad, ficha intacta (S4/S6.1)', () => {
  const SEED = empresa({
    razonSocial: 'Textiles Pacífico S.A.C.',
    ruc: '20556677889',
    relacion: 'cliente',
    sector: 'Construcción',
  });

  it('a name match (case- and space-insensitive) creates a NEW oportunidad on that ficha, never a new ficha', async () => {
    const repo = makeFakeRepo([empresa({ razonSocial: 'Textiles Pacífico S.A.C.', ruc: null })]);
    const r = await entrante(repo, { ...DATOS, razonSocial: '  TEXTILES   pacífico s.a.c. ', ruc: '' });
    expect(r.existente).toBe(true);
    expect(r.empresa.idEmpresa).toBe('e-1');
    expect(repo.rows).toHaveLength(1);
    expect(repo.oportunidades).toHaveLength(1);
    expect(r.oportunidad).toMatchObject({
      idEmpresa: 'e-1',
      etapa: 'contactado',
      medio: 'whatsapp',
      faltaResponderDesde: NOW,
      proximaAccion: ACCION,
    });
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: 'e-1',
      idOportunidad: r.oportunidad?.idOportunidad,
      direccion: 'entrante',
      resultado: 'pendiente',
    });
    expect(repo.seguimientos).toBe(1);
    expect(repo.escrituras).toBe(2);
  });

  it('an existing RUC lands the deal on the empresa that holds it, whatever the name', async () => {
    const repo = makeFakeRepo([SEED]);
    const r = await entrante(repo, { ...DATOS, razonSocial: 'Otro nombre comercial' });
    expect(r.existente).toBe(true);
    expect(r.empresa.idEmpresa).toBe('e-1');
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.razonSocial).toBe('Textiles Pacífico S.A.C.');
    // A cliente asking for another service keeps its relacion (S6.1/S5.2).
    expect(repo.rows[0]?.relacion).toBe('cliente');
  });

  it('the inbound contact of an existing empresa never rewrites its data or contacts', async () => {
    const repo = makeFakeRepo([SEED]);
    await entrante(repo, DATOS);
    expect(repo.rows[0]).toMatchObject({
      razonSocial: 'Textiles Pacífico S.A.C.',
      sector: 'Construcción',
      contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
    });
  });

  it('two inbound contacts on the same empresa create two oportunidades', async () => {
    const repo = makeFakeRepo([SEED]);
    await entrante(repo, { ...DATOS, necesita: 'Primera consulta' });
    await entrante(repo, { ...DATOS, razonSocial: 'textiles pacífico s.a.c.', necesita: 'Segunda consulta' });
    expect(repo.rows).toHaveLength(1);
    expect(repo.oportunidades).toHaveLength(2);
    expect(repo.oportunidades.map((o) => o.nombre).sort()).toEqual(['Primera consulta', 'Segunda consulta'].sort());
  });

  it('the next action is required also for an existing empresa', async () => {
    await rechaza({ ...DATOS, proximaAccion: null }, 'Elige la próxima acción.', makeFakeRepo([SEED]));
  });

  it('input rejected on an existing empresa leaves rows, oportunidades and counters unchanged', async () => {
    await rechaza({ ...DATOS, telefono: '', correo: '' }, 'Escribe un teléfono o un correo.', makeFakeRepo([SEED]));
    await rechaza({ ...DATOS, proximaAccion: null }, 'Elige la próxima acción.', makeFakeRepo([SEED]));
  });
});

describe('RegistrarEntranteUseCase — sector (only for a new ficha)', () => {
  it('a new ficha takes the sector, resolved case-insensitively to the stored name', async () => {
    const repo = makeFakeRepo();
    const r = await entrante(repo, { ...DATOS, sector: '  comercio y tiendas ' });
    expect(r.existente).toBe(false);
    expect(r.empresa.sector).toBe('Comercio y Tiendas');
    expect(repo.rows[0]?.sector).toBe('Comercio y Tiendas');
  });

  it('without sector (or blank) the ficha keeps "Sin definir"', async () => {
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
    await rechaza({ ...DATOS, sector: 'Astrología' }, 'Sector desconocido: Astrología', makeFakeRepo());
  });
});
