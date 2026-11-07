import { describe, expect, it } from 'vitest';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type { Empresa, Sector } from '../../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  EtapaInvalidaError,
  RucDuplicadoError,
  SectorDuplicadoError,
} from '../../domain/errors';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { ActualizarEmpresaUseCase } from '../actualizarEmpresa';
import { ActualizarSeguimientoUseCase } from '../actualizarSeguimiento';
import { ListarEmpresasUseCase } from '../listarEmpresas';
import { MoverEmpresaUseCase } from '../moverEmpresa';
import { CrearSectorUseCase, ListarSectoresUseCase } from '../sectores';

// ---- In-memory fake mirroring SqlServerCrmEmpresaRepository semantics ----

const NOW = '2026-01-01T00:00:00.000Z';

type Fake = ICrmEmpresaRepository & {
  rows: Empresa[];
  sectores: Sector[];
  escrituras: number;
  seguimientos: number;
};

function makeFakeRepo(seed: Empresa[] = []): Fake {
  const rows: Empresa[] = seed.map((r) => structuredClone(r));
  const sectores: Sector[] = [
    { nombre: 'Construcción', icono: 'casco' },
    { nombre: 'Comercio y Tiendas', icono: 'tienda' },
  ];
  const repo: Fake = {
    rows,
    sectores,
    escrituras: 0,
    seguimientos: 0,
    async getById(id) {
      const row = rows.find((r) => r.idEmpresa === id);
      return row ? structuredClone(row) : null;
    },
    async findByRuc(ruc) {
      const row = ruc === null ? undefined : rows.find((r) => r.ruc === ruc);
      return row ? structuredClone(row) : null;
    },
    async list() {
      return rows.map((r) => structuredClone(r));
    },
    async create(input) {
      repo.escrituras++;
      if (input.ruc !== null && rows.some((r) => r.ruc === input.ruc)) throw new RucDuplicadoError(input.ruc);
      const row: Empresa = {
        idEmpresa: `e-${rows.length + 1}`,
        razonSocial: input.razonSocial,
        ruc: input.ruc,
        sector: input.sector,
        contactos: structuredClone(input.contactos),
        notas: input.notas,
        direccion: input.direccion,
        etapa: input.etapa,
        medio: null,
        motivo: null,
        medioOtro: null,
        intentosSinRespuesta: 0,
        faltaResponderDesde: null,
        proximaAccion: null,
        origen: null,
        sugerenciaDescartadaEn: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      rows.push(row);
      return structuredClone(row);
    },
    async update(id, datos) {
      repo.escrituras++;
      const row = rows.find((r) => r.idEmpresa === id);
      if (!row) throw new EmpresaNotFoundError(id);
      if (datos.ruc !== null && rows.some((r) => r.idEmpresa !== id && r.ruc === datos.ruc)) {
        throw new RucDuplicadoError(datos.ruc);
      }
      Object.assign(row, structuredClone(datos));
      return structuredClone(row);
    },
    async updateEstado(id, estado) {
      repo.escrituras++;
      const row = rows.find((r) => r.idEmpresa === id);
      if (!row) throw new EmpresaNotFoundError(id);
      row.etapa = estado.etapa;
      row.medio = estado.medio;
      if (estado.medio !== 'otro') row.medioOtro = null;
      row.motivo = estado.motivo ? { ...estado.motivo } : null;
      return structuredClone(row);
    },
    async updateSeguimiento(id, s) {
      repo.escrituras++;
      repo.seguimientos++;
      const row = rows.find((r) => r.idEmpresa === id);
      if (!row) throw new EmpresaNotFoundError(id);
      row.etapa = s.etapa;
      row.medio = s.medio;
      row.medioOtro = s.medioOtro;
      row.motivo = s.motivo ? { ...s.motivo } : null;
      row.intentosSinRespuesta = s.intentosSinRespuesta;
      row.faltaResponderDesde = s.faltaResponderDesde;
      row.proximaAccion = s.proximaAccion ? { ...s.proximaAccion } : null;
      row.sugerenciaDescartadaEn = s.sugerenciaDescartadaEn;
      return structuredClone(row);
    },
    async addInteraccion() {
      throw new Error('not used');
    },
    async listInteracciones() {
      return [];
    },
    async fusionar() {
      throw new Error('not used');
    },
    async listSectores() {
      return [...sectores];
    },
    async createSector(nombre, icono) {
      repo.escrituras++;
      if (sectores.some((s) => s.nombre.toLowerCase() === nombre.toLowerCase())) throw new SectorDuplicadoError(nombre);
      const creado: Sector = { nombre, icono };
      sectores.push(creado);
      return creado;
    },
  };
  return repo;
}

function empresa(parcial: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
    notas: null,
    direccion: null,
    etapa: 'por_contactar',
    medio: null,
    motivo: null,
    medioOtro: null,
    intentosSinRespuesta: 0,
    faltaResponderDesde: null,
    proximaAccion: null,
    origen: null,
    sugerenciaDescartadaEn: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...parcial,
  };
}

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

describe('CrearEmpresaUseCase', () => {
  it('stores the empresa in Por contactar with all its contacts, the first one principal', async () => {
    const repo = makeFakeRepo();
    const e = await new CrearEmpresaUseCase(repo).execute(DATOS);
    expect(e.etapa).toBe('por_contactar');
    expect(e.medio).toBeNull();
    expect(e.contactos.map((c) => c.nombre)).toEqual(['Renzo Vargas', 'Lucía Prado']);
    expect(repo.rows).toHaveLength(1);
  });

  it('trims text, turns blank optionals into null and keeps the sector spelling of the catalog', async () => {
    const repo = makeFakeRepo();
    const e = await new CrearEmpresaUseCase(repo).execute({
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
    await expect(new CrearEmpresaUseCase(repo).execute({ ...DATOS, ...cambio })).rejects.toThrow(
      DatosEmpresaInvalidosError,
    );
    await expect(new CrearEmpresaUseCase(repo).execute({ ...DATOS, ...cambio })).rejects.toThrow(mensaje);
    expect(repo.rows).toHaveLength(0);
    expect(repo.escrituras).toBe(0);
  });

  it('rejects a duplicated RUC and leaves the stored empresa untouched', async () => {
    const repo = makeFakeRepo([empresa({ ruc: DATOS.ruc })]);
    await expect(new CrearEmpresaUseCase(repo).execute(DATOS)).rejects.toBeInstanceOf(RucDuplicadoError);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.razonSocial).toBe('Constructora Andina S.A.C.');
  });
});

describe('ActualizarEmpresaUseCase', () => {
  it('replaces the data and the whole contacts list, leaving stage, medium and reason alone', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'perdido', medio: 'llamada', motivo: { categoria: 'precio', detalle1: 'S/ 1', detalle2: null, notas: null } }),
    ]);
    const e = await new ActualizarEmpresaUseCase(repo).execute('e-1', DATOS);
    expect(e.razonSocial).toBe('Textiles Pacífico S.A.C.');
    expect(e.contactos).toHaveLength(2);
    expect(e.etapa).toBe('perdido');
    expect(e.medio).toBe('llamada');
    expect(e.motivo?.categoria).toBe('precio');
  });

  it('allows keeping the empresa\'s own RUC but not taking another empresa\'s', async () => {
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })]);
    const uc = new ActualizarEmpresaUseCase(repo);
    await expect(uc.execute('e-1', { ...DATOS, ruc: '20512345678' })).resolves.toMatchObject({ ruc: '20512345678' });
    await expect(uc.execute('e-1', { ...DATOS, ruc: '20600000001' })).rejects.toBeInstanceOf(RucDuplicadoError);
    expect(repo.rows[0]?.ruc).toBe('20512345678');
  });

  it('rejects invalid data without writing, and an unknown id as not found', async () => {
    const repo = makeFakeRepo([empresa()]);
    const uc = new ActualizarEmpresaUseCase(repo);
    await expect(uc.execute('e-1', { ...DATOS, ruc: '123' })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc.execute('nope', DATOS)).rejects.toBeInstanceOf(EmpresaNotFoundError);
    expect(repo.escrituras).toBe(0);
    expect(repo.rows[0]?.razonSocial).toBe('Constructora Andina S.A.C.');
  });
});

describe('MoverEmpresaUseCase', () => {
  const mover = (repo: Fake) => new MoverEmpresaUseCase(repo);

  it('rejects an unknown stage and writes nothing', async () => {
    const repo = makeFakeRepo([empresa()]);
    await expect(mover(repo).execute('e-1', 'archivado')).rejects.toBeInstanceOf(EtapaInvalidaError);
    expect(repo.escrituras).toBe(0);
  });

  it('throws not found for an unknown id', async () => {
    await expect(mover(makeFakeRepo()).execute('nope', 'contactado', { medio: 'llamada' })).rejects.toBeInstanceOf(
      EmpresaNotFoundError,
    );
  });

  it('Contactado needs a medium: from Por contactar without one it is rejected and the empresa stays', async () => {
    const repo = makeFakeRepo([empresa()]);
    await expect(mover(repo).execute('e-1', 'contactado')).rejects.toThrow(/cómo se contactó/i);
    await expect(mover(repo).execute('e-1', 'contactado', { medio: 'paloma' })).rejects.toThrow(/medio de contacto/i);
    expect(repo.rows[0]?.etapa).toBe('por_contactar');
    expect(repo.escrituras).toBe(0);
  });

  it('stores the medium when moving to Contactado, and keeps it when moving on', async () => {
    const repo = makeFakeRepo([empresa()]);
    const c = await mover(repo).execute('e-1', 'contactado', { medio: 'whatsapp' });
    expect(c).toMatchObject({ etapa: 'contactado', medio: 'whatsapp' });
    const s = await mover(repo).execute('e-1', 'en_seguimiento');
    expect(s).toMatchObject({ etapa: 'en_seguimiento', medio: 'whatsapp' });
    const back = await mover(repo).execute('e-1', 'contactado');
    expect(back.medio).toBe('whatsapp');
  });

  it('going back to Por contactar clears the medium', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada' })]);
    const e = await mover(repo).execute('e-1', 'por_contactar', { medio: 'correo' });
    expect(e).toMatchObject({ etapa: 'por_contactar', medio: null });
  });

  it('a direct jump from Por contactar to En seguimiento or Cliente does not ask for a medium (as designed)', async () => {
    for (const etapa of ['en_seguimiento', 'cliente']) {
      const repo = makeFakeRepo([empresa()]);
      const e = await mover(repo).execute('e-1', etapa);
      expect(e).toMatchObject({ etapa, medio: null });
    }
  });

  it('Perdido needs a valid reason; without it the empresa does not move', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'cliente' })]);
    await expect(mover(repo).execute('e-1', 'perdido')).rejects.toThrow(/motivo/i);
    await expect(mover(repo).execute('e-1', 'perdido', { motivo: { categoria: 'zzz' } })).rejects.toThrow(/motivo/i);
    await expect(
      mover(repo).execute('e-1', 'perdido', { motivo: { categoria: 'precio', detalle1: '  ' } }),
    ).rejects.toThrow(/Precio que les ofrecimos/);
    await expect(mover(repo).execute('e-1', 'perdido', { motivo: { categoria: 'otro' } })).rejects.toThrow(
      /Cuéntanos el motivo/,
    );
    expect(repo.rows[0]?.etapa).toBe('cliente');
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
      const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada' })]);
      const e = await mover(repo).execute('e-1', 'perdido', { motivo: entrada });
      expect(e.etapa).toBe('perdido');
      expect(e.motivo).toEqual(esperado);
    }
  });

  it('rejects a detail or notes longer than the database accepts', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada' })]);
    await expect(
      mover(repo).execute('e-1', 'perdido', { motivo: { categoria: 'precio', detalle1: 'x'.repeat(201) } }),
    ).rejects.toThrow(/200/);
    await expect(
      mover(repo).execute('e-1', 'perdido', { motivo: { categoria: 'sin_interes', notas: 'x'.repeat(301) } }),
    ).rejects.toThrow(/300/);
    expect(repo.rows[0]?.etapa).toBe('contactado');
  });

  it('leaving Perdido deletes the reason; the medium that was there is kept', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'perdido', medio: 'llamada', motivo: { categoria: 'precio', detalle1: 'S/ 1', detalle2: null, notas: null } }),
    ]);
    const e = await mover(repo).execute('e-1', 'contactado', { medio: 'correo' });
    expect(e).toMatchObject({ etapa: 'contactado', medio: 'correo', motivo: null });
  });

  it('a normal move (Por contactar → Contactado → En seguimiento) still goes through updateEstado and keeps the follow-up state', async () => {
    const accion = { tipo: 'llamar' as const, detalle: null, fecha: '2026-11-03' };
    const repo = makeFakeRepo([empresa({ proximaAccion: accion, intentosSinRespuesta: 2, faltaResponderDesde: NOW })]);
    await mover(repo).execute('e-1', 'contactado', { medio: 'llamada' });
    const e = await mover(repo).execute('e-1', 'en_seguimiento');
    expect(e).toMatchObject({ etapa: 'en_seguimiento', medio: 'llamada', proximaAccion: accion, intentosSinRespuesta: 2, faltaResponderDesde: NOW });
    expect(repo.seguimientos).toBe(0);
    expect(repo.escrituras).toBe(2);
  });

  it('moving to Cliente or Perdido clears the next action and keeps everything else (L6)', async () => {
    const accion = { tipo: 'cotizar' as const, detalle: null, fecha: '2026-11-03' };
    const base = { etapa: 'contactado' as const, medio: 'correo' as const, proximaAccion: accion, intentosSinRespuesta: 2, faltaResponderDesde: NOW, sugerenciaDescartadaEn: 3 };
    const aCliente = makeFakeRepo([empresa(base)]);
    const c = await mover(aCliente).execute('e-1', 'cliente');
    expect(c).toMatchObject({ etapa: 'cliente', medio: 'correo', proximaAccion: null, intentosSinRespuesta: 2, faltaResponderDesde: NOW, sugerenciaDescartadaEn: 3 });
    const aPerdido = makeFakeRepo([empresa(base)]);
    const p = await mover(aPerdido).execute('e-1', 'perdido', { motivo: { categoria: 'sin_interes' } });
    expect(p).toMatchObject({ etapa: 'perdido', medio: 'correo', proximaAccion: null, motivo: { categoria: 'sin_interes' } });
    expect(aPerdido.rows[0]?.proximaAccion).toBeNull();
  });

  it('moving to Cliente keeps the free-text medium when the stored medium is "otro"', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' })]);
    const c = await mover(repo).execute('e-1', 'cliente');
    expect(c).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
  });

  it('a rejected move to Perdido leaves the next action in place', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } })]);
    await expect(mover(repo).execute('e-1', 'perdido')).rejects.toThrow(/motivo/i);
    expect(repo.escrituras).toBe(0);
    expect(repo.rows[0]?.proximaAccion).not.toBeNull();
  });

  it('the stage move rejects medium "otro": it cannot carry "¿Cuál?" (the contact flow is the place to pick it)', async () => {
    const repo = makeFakeRepo([empresa()]);
    await expect(mover(repo).execute('e-1', 'contactado', { medio: 'otro' })).rejects.toThrow(
      'Elige el medio de contacto: llamada, correo o WhatsApp',
    );
    expect(repo.escrituras).toBe(0);
    expect(repo.rows[0]?.etapa).toBe('por_contactar');
  });

  it('moving with an already stored medium "otro" keeps it and its free text', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' })]);
    const e = await mover(repo).execute('e-1', 'en_seguimiento');
    expect(e).toMatchObject({ medio: 'otro', medioOtro: 'Feria' });
  });

  it('a move back to Por contactar clears the medium and its free text', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'otro', medioOtro: 'Feria' })]);
    const e = await mover(repo).execute('e-1', 'por_contactar');
    expect(e).toMatchObject({ medio: null, medioOtro: null });
  });

  it('a stage change never touches the empresa data or contacts', async () => {
    const repo = makeFakeRepo([empresa({ contactos: DATOS.contactos })]);
    await mover(repo).execute('e-1', 'cliente');
    expect(repo.rows[0]).toMatchObject({ razonSocial: 'Constructora Andina S.A.C.', ruc: '20512345678' });
    expect(repo.rows[0]?.contactos).toHaveLength(2);
  });
});

describe('ActualizarSeguimientoUseCase', () => {
  const uc = (repo: Fake) => new ActualizarSeguimientoUseCase(repo);

  it('changes only the medium, without moving the empresa', async () => {
    const repo = makeFakeRepo([empresa({ etapa: 'en_seguimiento', medio: 'llamada' })]);
    const e = await uc(repo).execute('e-1', { medio: 'correo' });
    expect(e).toMatchObject({ etapa: 'en_seguimiento', medio: 'correo' });
  });

  it('changes only the reason of a lost empresa', async () => {
    const repo = makeFakeRepo([
      empresa({ etapa: 'perdido', medio: 'llamada', motivo: { categoria: 'proveedor', detalle1: 'Norte', detalle2: null, notas: null } }),
    ]);
    const e = await uc(repo).execute('e-1', { motivo: { categoria: 'precio', detalle1: 'S/ 7,000' } });
    expect(e.etapa).toBe('perdido');
    expect(e.medio).toBe('llamada');
    expect(e.motivo).toEqual({ categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: null });
  });

  it('refuses a medium on Por contactar, a reason outside Perdido, an invalid value or an empty change', async () => {
    const nueva = makeFakeRepo([empresa()]);
    await expect(uc(nueva).execute('e-1', { medio: 'llamada' })).rejects.toThrow(/Contactado/);
    await expect(uc(nueva).execute('e-1', { motivo: { categoria: 'precio', detalle1: 'x' } })).rejects.toThrow(/Perdido/);
    await expect(uc(nueva).execute('e-1', {})).rejects.toThrow(/nada que actualizar/i);
    const activa = makeFakeRepo([empresa({ etapa: 'contactado', medio: 'llamada' })]);
    await expect(uc(activa).execute('e-1', { medio: 'paloma' })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc(activa).execute('e-1', { medio: null })).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    expect(nueva.escrituras + activa.escrituras).toBe(0);
    expect(activa.rows[0]?.medio).toBe('llamada');
    await expect(uc(makeFakeRepo()).execute('nope', { medio: 'llamada' })).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });
});

describe('sectores', () => {
  it('lists and creates sectors, trimming and collapsing spaces', async () => {
    const repo = makeFakeRepo();
    expect(await new ListarSectoresUseCase(repo).execute()).toEqual([
      { nombre: 'Construcción', icono: 'casco' },
      { nombre: 'Comercio y Tiendas', icono: 'tienda' },
    ]);
    expect(await new CrearSectorUseCase(repo).execute('  Educación   y   Cultura ')).toEqual({
      nombre: 'Educación y Cultura',
      icono: null,
    });
    expect(repo.sectores).toContainEqual({ nombre: 'Educación y Cultura', icono: null });
  });

  it('stores the icon when one is given and returns the stored sector', async () => {
    const repo = makeFakeRepo();
    expect(await new CrearSectorUseCase(repo).execute('Clínicas', 'salud')).toEqual({ nombre: 'Clínicas', icono: 'salud' });
    expect(repo.sectores).toContainEqual({ nombre: 'Clínicas', icono: 'salud' });
  });

  it('treats a null or undefined icon as "no icon"', async () => {
    const repo = makeFakeRepo();
    expect((await new CrearSectorUseCase(repo).execute('A', null)).icono).toBeNull();
    expect((await new CrearSectorUseCase(repo).execute('B', undefined)).icono).toBeNull();
  });

  it('rejects an unknown icon key with DatosEmpresaInvalidosError and stores nothing', async () => {
    const repo = makeFakeRepo();
    await expect(new CrearSectorUseCase(repo).execute('Clínicas', 'cohete')).rejects.toBeInstanceOf(
      DatosEmpresaInvalidosError,
    );
    expect(repo.sectores).toHaveLength(2);
    expect(repo.escrituras).toBe(0);
  });

  it('rejects empty names, names over 50 characters and duplicates in any case', async () => {
    const repo = makeFakeRepo();
    const uc = new CrearSectorUseCase(repo);
    await expect(uc.execute('   ')).rejects.toBeInstanceOf(DatosEmpresaInvalidosError);
    await expect(uc.execute('x'.repeat(51))).rejects.toThrow(/50/);
    await expect(uc.execute('CONSTRUCCIÓN')).rejects.toBeInstanceOf(SectorDuplicadoError);
    expect(repo.sectores).toHaveLength(2);
  });

  it('a new empresa can use a sector created later', async () => {
    const repo = makeFakeRepo();
    await new CrearSectorUseCase(repo).execute('Educación');
    const e = await new CrearEmpresaUseCase(repo).execute({ ...DATOS, sector: 'Educación' });
    expect(e.sector).toBe('Educación');
  });
});

describe('ListarEmpresasUseCase', () => {
  it('returns what the repository holds, with contacts', async () => {
    const repo = makeFakeRepo([empresa(), empresa({ idEmpresa: 'e-2', ruc: '20600000001' })]);
    const lista = await new ListarEmpresasUseCase(repo).execute();
    expect(lista.map((e) => e.idEmpresa)).toEqual(['e-1', 'e-2']);
    expect(lista[0]?.contactos).toHaveLength(1);
  });
});
