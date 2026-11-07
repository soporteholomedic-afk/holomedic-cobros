import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError, RucDuplicadoError, SectorDuplicadoError } from '../../domain/errors';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { ActualizarEmpresaUseCase } from '../actualizarEmpresa';
import { ListarEmpresasUseCase } from '../listarEmpresas';
import { CrearSectorUseCase, ListarSectoresUseCase } from '../sectores';
import { empresa, foto, makeFakeRepo } from './fakeRepo';

const DATOS = {
  razonSocial: 'Textiles Pacífico S.A.C.',
  ruc: '20556677889',
  sector: 'Construcción',
  notas: 'Llegó por referido.',
  contactos: [
    { nombre: 'Renzo Vargas', telefono: '998 201 456', correo: 'renzo@tp.pe' },
    { nombre: 'Lucía Prado', telefono: '998 220 145', correo: null },
  ],
};

describe('CrearEmpresaUseCase — ficha sin oportunidad (S7.1)', () => {
  it('creates ONLY the empresa ficha as Prospecto, with all its contacts, the first one principal', async () => {
    const repo = makeFakeRepo();
    const e = await new CrearEmpresaUseCase(repo.empresaRepo).execute(DATOS);
    expect(e.relacion).toBe('prospecto');
    expect(e.contactos.map((c) => c.nombre)).toEqual(['Renzo Vargas', 'Lucía Prado']);
    expect(repo.rows).toHaveLength(1);
    // S7.1: creating an empresa never creates an oportunidad.
    expect(repo.oportunidades).toHaveLength(0);
    expect(repo.escrituras).toBe(1);
  });

  it('accepts an explicit relacion and rejects an unknown one', async () => {
    const repo = makeFakeRepo();
    const cliente = await new CrearEmpresaUseCase(repo.empresaRepo).execute(DATOS, { relacion: 'cliente' });
    expect(cliente.relacion).toBe('cliente');
    const mala = makeFakeRepo();
    await expect(
      new CrearEmpresaUseCase(mala.empresaRepo).execute(DATOS, { relacion: 'perdido' }),
    ).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    expect(mala.rows).toHaveLength(0);
    expect(mala.escrituras).toBe(0);
  });

  it('trims text, turns blank optionals into null and keeps the sector spelling of the catalog', async () => {
    const repo = makeFakeRepo();
    const e = await new CrearEmpresaUseCase(repo.empresaRepo).execute({
      razonSocial: '  Andina  ',
      ruc: ' 20512345678 ',
      sector: 'construcción',
      notas: '   ',
      contactos: [{ nombre: ' Ana ', telefono: ' 900 111 222 ', correo: '  ' }],
    });
    expect(e).toMatchObject({ razonSocial: 'Andina', ruc: '20512345678', sector: 'Construcción', notas: null });
    expect(e.contactos[0]).toEqual({ nombre: 'Ana', telefono: '900 111 222', correo: null });
  });

  it.each([
    ['razón social vacía', { razonSocial: '  ' }, /razón social/i],
    ['RUC de 10 dígitos', { ruc: '2051234567' }, /11 dígitos/],
    ['RUC con letras', { ruc: '2051234567A' }, /11 dígitos/],
    ['sector que no existe', { sector: 'Astrología' }, /Sector desconocido/],
    ['sin contactos', { contactos: [] }, /al menos un contacto/i],
    ['contacto sin nombre', { contactos: [{ nombre: ' ', telefono: '900111222' }] }, /Contacto principal: falta el nombre/],
    ['contacto sin teléfono', { contactos: [{ nombre: 'A', telefono: '' }] }, /falta el teléfono/],
    ['teléfono de 8 dígitos', { contactos: [{ nombre: 'A', telefono: '9001112' }] }, /9 dígitos/],
    ['correo inválido', { contactos: [{ nombre: 'A', telefono: '900111222', correo: 'mal@' }] }, /correo no es válido/],
    [
      'segundo contacto inválido',
      { contactos: [{ nombre: 'A', telefono: '900111222' }, { nombre: 'B', telefono: '12' }] },
      /Contacto 2: el teléfono/,
    ],
    [
      'más de 10 contactos',
      { contactos: Array.from({ length: 11 }, (_, i) => ({ nombre: `C${i}`, telefono: '900111222' })) },
      /Máximo 10/,
    ],
  ])('rejects %s and stores nothing', async (_n, cambio, mensaje) => {
    const repo = makeFakeRepo();
    await expect(new CrearEmpresaUseCase(repo.empresaRepo).execute({ ...DATOS, ...cambio })).rejects.toThrow(
      DatosEmpresaInvalidosError,
    );
    await expect(new CrearEmpresaUseCase(repo.empresaRepo).execute({ ...DATOS, ...cambio })).rejects.toThrow(mensaje);
    expect(repo.rows).toHaveLength(0);
    expect(repo.escrituras).toBe(0);
  });

  it('rejects a duplicated RUC and leaves the stored empresa untouched', async () => {
    const repo = makeFakeRepo([empresa({ ruc: DATOS.ruc })]);
    await expect(new CrearEmpresaUseCase(repo.empresaRepo).execute(DATOS)).rejects.toBeInstanceOf(RucDuplicadoError);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.razonSocial).toBe('Constructora Andina S.A.C.');
  });
});

describe('ActualizarEmpresaUseCase', () => {
  it('replaces the data and the whole contacts list, leaving the relacion alone', async () => {
    const repo = makeFakeRepo([empresa({ relacion: 'cliente', notas: 'vieja' })]);
    const e = await new ActualizarEmpresaUseCase(repo.empresaRepo).execute('e-1', DATOS);
    expect(e.razonSocial).toBe('Textiles Pacífico S.A.C.');
    expect(e.contactos).toHaveLength(2);
    expect(e.relacion).toBe('cliente');
  });

  it("allows keeping the empresa's own RUC but not taking another empresa's", async () => {
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })]);
    const uc = new ActualizarEmpresaUseCase(repo.empresaRepo);
    await expect(uc.execute('e-1', { ...DATOS, ruc: '20512345678' })).resolves.toMatchObject({ ruc: '20512345678' });
    await expect(uc.execute('e-1', { ...DATOS, ruc: '20600000001' })).rejects.toBeInstanceOf(RucDuplicadoError);
    expect(repo.rows[0]?.ruc).toBe('20512345678');
  });

  it('rejects invalid data without writing, and an unknown id as not found', async () => {
    const repo = makeFakeRepo([empresa()]);
    const uc = new ActualizarEmpresaUseCase(repo.empresaRepo);
    await expect(uc.execute('e-1', { ...DATOS, ruc: '123' })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc.execute('nope', DATOS)).rejects.toThrow(/Empresa not found/);
    expect(repo.escrituras).toBe(0);
    expect(repo.rows[0]?.razonSocial).toBe('Constructora Andina S.A.C.');
  });
});

describe('sectores', () => {
  it('lists exactly what the repository holds (alphabetical) and creates sectors, trimming and collapsing spaces', async () => {
    const repo = makeFakeRepo();
    expect(await new ListarSectoresUseCase(repo.empresaRepo).execute()).toEqual(await repo.empresaRepo.listSectores());
    expect(await new CrearSectorUseCase(repo.empresaRepo).execute('  Educación   y   Cultura ')).toEqual({
      nombre: 'Educación y Cultura',
      icono: null,
    });
    expect(repo.sectores).toContainEqual({ nombre: 'Educación y Cultura', icono: null });
  });

  it('stores the icon when one is given and returns the stored sector', async () => {
    const repo = makeFakeRepo();
    expect(await new CrearSectorUseCase(repo.empresaRepo).execute('Clínicas', 'salud')).toEqual({ nombre: 'Clínicas', icono: 'salud' });
    expect(repo.sectores).toContainEqual({ nombre: 'Clínicas', icono: 'salud' });
  });

  it('treats a null or undefined icon as "no icon"', async () => {
    const repo = makeFakeRepo();
    expect((await new CrearSectorUseCase(repo.empresaRepo).execute('A', null)).icono).toBeNull();
    expect((await new CrearSectorUseCase(repo.empresaRepo).execute('B', undefined)).icono).toBeNull();
  });

  it('rejects an unknown icon key with DatosEmpresaInvalidosError and stores nothing', async () => {
    const repo = makeFakeRepo();
    await expect(new CrearSectorUseCase(repo.empresaRepo).execute('Clínicas', 'cohete')).rejects.toBeInstanceOf(
      DatosEmpresaInvalidosError,
    );
    expect(repo.sectores).toHaveLength(2);
    expect(repo.escrituras).toBe(0);
  });

  it('rejects empty names, names over 50 characters and duplicates in any case', async () => {
    const repo = makeFakeRepo();
    const uc = new CrearSectorUseCase(repo.empresaRepo);
    await expect(uc.execute('   ')).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc.execute('x'.repeat(51))).rejects.toThrow(/50/);
    await expect(uc.execute('CONSTRUCCIÓN')).rejects.toBeInstanceOf(SectorDuplicadoError);
    expect(repo.sectores).toHaveLength(2);
  });

  it('a new empresa can use a sector created later', async () => {
    const repo = makeFakeRepo();
    await new CrearSectorUseCase(repo.empresaRepo).execute('Educación');
    const e = await new CrearEmpresaUseCase(repo.empresaRepo).execute({ ...DATOS, sector: 'Educación' });
    expect(e.sector).toBe('Educación');
  });
});

describe('ListarEmpresasUseCase', () => {
  it('returns what the repository holds, with contacts', async () => {
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })]);
    const lista = await new ListarEmpresasUseCase(repo.empresaRepo).execute();
    expect(lista.map((e) => e.idEmpresa)).toEqual(['e-1', 'e-2']);
    expect(lista[0]?.contactos).toHaveLength(1);
  });

  it('never mutates storage', async () => {
    const repo = makeFakeRepo([empresa()]);
    const antes = foto(repo);
    await new ListarEmpresasUseCase(repo.empresaRepo).execute();
    expect(foto(repo)).toEqual(antes);
  });
});
