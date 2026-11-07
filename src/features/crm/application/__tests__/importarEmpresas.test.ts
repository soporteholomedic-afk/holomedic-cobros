import { describe, expect, it } from 'vitest';

import type { Empresa, Sector } from '../../domain/entities';
import { RucDuplicadoError } from '../../domain/errors';
import type { ICrmEmpresaRepository } from '../../domain/ports';
import type { FilaExcelEmpresa } from '../../infrastructure/excel/leerExcelEmpresas';
import { ImportarEmpresasUseCase, evaluarImportacion } from '../importarEmpresas';

const NOW = '2026-01-01T00:00:00.000Z';

type Fake = ICrmEmpresaRepository & { rows: Empresa[]; sectores: Sector[]; escrituras: number };

function makeFake(seed: Empresa[] = [], sectores = ['Construcción', 'Comercio y Tiendas']): Fake {
  const rows = seed.map((r) => structuredClone(r));
  const lista: Sector[] = sectores.map((nombre) => ({ nombre, icono: null }));
  const repo: Fake = {
    rows,
    sectores: lista,
    escrituras: 0,
    async getById(id) {
      return rows.find((r) => r.idEmpresa === id) ?? null;
    },
    async findByRuc(ruc) {
      return ruc === null ? null : (rows.find((r) => r.ruc === ruc) ?? null);
    },
    async list() {
      return rows.map((r) => structuredClone(r));
    },
    async create(input) {
      repo.escrituras++;
      if (input.ruc !== null && rows.some((r) => r.ruc === input.ruc)) throw new RucDuplicadoError(input.ruc);
      const row: Empresa = {
        idEmpresa: `e-${rows.length + 1}`,
        ...structuredClone(input),
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
    async update() {
      throw new Error('not used');
    },
    async updateEstado() {
      throw new Error('not used');
    },
    async updateSeguimiento() {
      throw new Error('not used');
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
      return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
    },
    async createSector(nombre, icono) {
      repo.escrituras++;
      const creado: Sector = { nombre, icono };
      lista.push(creado);
      return creado;
    },
  };
  return repo;
}

const EXISTENTE: Empresa = {
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
};

function fila(n: number, parcial: Partial<FilaExcelEmpresa> = {}): FilaExcelEmpresa {
  return {
    fila: n,
    razonSocial: `Empresa ${n} S.A.C.`,
    ruc: `2060000${String(n).padStart(4, '0')}`,
    sector: 'Construcción',
    contacto: 'Rosa Mendoza',
    telefono: '987 111 222',
    correo: '',
    ...parcial,
  };
}

describe('evaluarImportacion', () => {
  it('marks a complete row as ok and counts it as ready', async () => {
    const { filas, resumen } = await evaluarImportacion([fila(2)], makeFake());
    expect(filas[0]).toMatchObject({ fila: 2, estado: 'ok', nota: '', sectorNuevo: false });
    expect(resumen).toEqual({ leidas: 1, listas: 1, errores: 0, repetidas: 0 });
  });

  it.each([
    ['la razón social', { razonSocial: ' ' }],
    ['el RUC', { ruc: '' }],
    ['el sector', { sector: '' }],
    ['el contacto', { contacto: '' }],
    ['el teléfono', { telefono: '' }],
  ] as const)('a row without %s is an error that says what is missing', async (que, vacio) => {
    const { filas } = await evaluarImportacion([fila(2, vacio)], makeFake());
    expect(filas[0]).toMatchObject({ estado: 'err', nota: `Falta ${que}` });
  });

  it('reports the first missing field in the order of the template', async () => {
    const { filas } = await evaluarImportacion([fila(2, { sector: '', telefono: '' })], makeFake());
    expect(filas[0].nota).toBe('Falta el sector');
  });

  it('follows the template order when several fields are missing at once', async () => {
    const campos = ['razonSocial', 'ruc', 'sector', 'contacto', 'telefono'] as const;
    const esperadas = ['la razón social', 'el RUC', 'el sector', 'el contacto', 'el teléfono'];
    for (let i = 0; i < campos.length - 1; i++) {
      const vacios = Object.fromEntries(campos.slice(i).map((c) => [c, ''])) as Partial<FilaExcelEmpresa>;
      const { filas } = await evaluarImportacion([fila(2, vacios)], makeFake());
      expect(filas[0].nota).toBe(`Falta ${esperadas[i]}`);
    }
  });

  it('rejects an RUC that does not have exactly 11 digits', async () => {
    const { filas } = await evaluarImportacion(
      [fila(2, { ruc: '2060444' }), fila(3, { ruc: '206000000001' }), fila(4, { ruc: '2060000000A' })],
      makeFake(),
    );
    expect(filas.map((f) => [f.estado, f.nota])).toEqual([
      ['err', 'El RUC debe tener 11 dígitos'],
      ['err', 'El RUC debe tener 11 dígitos'],
      ['err', 'El RUC debe tener 11 dígitos'],
    ]);
  });

  it('rejects a phone that does not have 9 digits, however it is spaced', async () => {
    const { filas } = await evaluarImportacion(
      [fila(2, { telefono: '98765432' }), fila(3, { telefono: '987 654 321' }), fila(4, { telefono: '9876543210' })],
      makeFake(),
    );
    expect(filas.map((f) => f.estado)).toEqual(['err', 'ok', 'err']);
    expect(filas[0].nota).toBe('El teléfono debe tener 9 dígitos');
  });

  it('accepts an empty correo, rejects an invalid one and accepts a valid one', async () => {
    const { filas } = await evaluarImportacion(
      [fila(2, { correo: '' }), fila(3, { correo: 'no-es-correo' }), fila(4, { correo: 'rosa@empresa.pe' })],
      makeFake(),
    );
    expect(filas.map((f) => [f.estado, f.nota])).toEqual([
      ['ok', ''],
      ['err', 'El correo no es válido'],
      ['ok', ''],
    ]);
  });

  it('rejects a sector name longer than 50 characters', async () => {
    const { filas } = await evaluarImportacion([fila(2, { sector: 'x'.repeat(51) })], makeFake());
    expect(filas[0]).toMatchObject({ estado: 'err', nota: 'El sector admite hasta 50 caracteres' });
  });

  it('flags an RUC that already exists in the CRM as repeated, not as an error', async () => {
    const { filas, resumen } = await evaluarImportacion([fila(2, { ruc: '20512345678' })], makeFake([EXISTENTE]));
    expect(filas[0]).toMatchObject({ estado: 'dup', nota: 'Ya existe en el CRM' });
    expect(resumen).toEqual({ leidas: 1, listas: 0, errores: 0, repetidas: 1 });
  });

  it('flags the second occurrence of an RUC inside the file and points at the first row', async () => {
    const { filas } = await evaluarImportacion([fila(2, { ruc: '20601112223' }), fila(3, { ruc: '20601112223' })], makeFake());
    expect(filas.map((f) => f.estado)).toEqual(['ok', 'dup']);
    expect(filas[1].nota).toBe('Repetida en la fila 2');
  });

  it('does not count an invalid row as the first occurrence of its RUC', async () => {
    const { filas } = await evaluarImportacion(
      [fila(2, { ruc: '20601112223', telefono: '1' }), fila(3, { ruc: '20601112223' })],
      makeFake(),
    );
    expect(filas.map((f) => f.estado)).toEqual(['err', 'ok']);
  });

  it('marks rows whose sector does not exist yet (any case) and not the ones that do', async () => {
    const { filas } = await evaluarImportacion(
      [fila(2, { sector: 'construcción' }), fila(3, { sector: 'Educación' }), fila(4, { sector: '  educación  ' })],
      makeFake(),
    );
    expect(filas.map((f) => f.sectorNuevo)).toEqual([false, true, true]);
  });

  it('counts leidas, listas, errores and repetidas together', async () => {
    const { resumen } = await evaluarImportacion(
      [fila(2), fila(3, { ruc: '1' }), fila(4, { ruc: '20512345678' }), fila(5)],
      makeFake([EXISTENTE]),
    );
    expect(resumen).toEqual({ leidas: 4, listas: 2, errores: 1, repetidas: 1 });
  });

  it('writes nothing: no sector and no empresa is created', async () => {
    const repo = makeFake();
    await evaluarImportacion([fila(2, { sector: 'Educación' }), fila(3)], repo);
    expect(repo.escrituras).toBe(0);
    expect(repo.rows).toHaveLength(0);
    expect(repo.sectores.map((s) => s.nombre)).toEqual(['Construcción', 'Comercio y Tiendas']);
  });
});

describe('ImportarEmpresasUseCase', () => {
  it('stores the ok rows in "Por contactar" with one principal contact and trimmed data', async () => {
    const repo = makeFake();
    const r = await new ImportarEmpresasUseCase(repo).execute([
      fila(2, { razonSocial: '  Distribuidora Andes S.A.C. ', ruc: ' 20601112223 ', contacto: ' Rosa Mendoza ', correo: ' rosa@andes.pe ' }),
    ]);
    expect(r).toEqual({ importadas: 1, sectoresNuevos: 0, omitidas: 0 });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      razonSocial: 'Distribuidora Andes S.A.C.',
      ruc: '20601112223',
      sector: 'Construcción',
      etapa: 'por_contactar',
      notas: null,
      contactos: [{ nombre: 'Rosa Mendoza', telefono: '987 111 222', correo: 'rosa@andes.pe' }],
    });
  });

  it('stores an empty correo as null', async () => {
    const repo = makeFake();
    await new ImportarEmpresasUseCase(repo).execute([fila(2, { correo: '' })]);
    expect(repo.rows[0].contactos[0].correo).toBeNull();
  });

  it('uses the stored spelling of an existing sector, whatever the case in the file', async () => {
    const repo = makeFake();
    await new ImportarEmpresasUseCase(repo).execute([fila(2, { sector: 'construcción' })]);
    expect(repo.rows[0].sector).toBe('Construcción');
    expect(repo.sectores.map((s) => s.nombre)).toEqual(['Construcción', 'Comercio y Tiendas']);
  });

  it('creates a new sector once for many rows, before the empresas that use it', async () => {
    const repo = makeFake();
    const r = await new ImportarEmpresasUseCase(repo).execute([
      fila(2, { sector: 'Educación' }),
      fila(3, { sector: ' educación ' }),
      fila(4, { sector: 'Salud' }),
    ]);
    expect(r).toEqual({ importadas: 3, sectoresNuevos: 2, omitidas: 0 });
    expect(repo.sectores.slice(2).map((s) => s.icono)).toEqual([null, null]);
    expect(repo.sectores.map((s) => s.nombre)).toEqual(['Construcción', 'Comercio y Tiendas', 'Educación', 'Salud']);
    expect(repo.rows.map((x) => x.sector)).toEqual(['Educación', 'Educación', 'Salud']);
  });

  it('skips error and repeated rows, stores nothing for them and creates no sector for them', async () => {
    const repo = makeFake([EXISTENTE]);
    const r = await new ImportarEmpresasUseCase(repo).execute([
      fila(2),
      fila(3, { ruc: '1', sector: 'Educación' }),
      fila(4, { ruc: '20512345678' }),
      fila(5, { ruc: fila(2).ruc }),
    ]);
    expect(r).toEqual({ importadas: 1, sectoresNuevos: 0, omitidas: 3 });
    expect(repo.rows.map((x) => x.ruc)).toEqual(['20512345678', fila(2).ruc]);
    expect(repo.sectores.map((s) => s.nombre)).toEqual(['Construcción', 'Comercio y Tiendas']);
  });

  it('does not create the sector of a repeated row, nor store that row', async () => {
    const repo = makeFake([EXISTENTE]);
    const r = await new ImportarEmpresasUseCase(repo).execute([fila(2, { ruc: '20512345678', sector: 'Educación' })]);
    expect(r).toEqual({ importadas: 0, sectoresNuevos: 0, omitidas: 1 });
    expect(repo.sectores.map((s) => s.nombre)).toEqual(['Construcción', 'Comercio y Tiendas']);
    expect(repo.rows).toHaveLength(1);
  });

  it('with no ok rows it writes nothing and reports zero imported', async () => {
    const repo = makeFake();
    const r = await new ImportarEmpresasUseCase(repo).execute([fila(2, { ruc: '1' })]);
    expect(r).toEqual({ importadas: 0, sectoresNuevos: 0, omitidas: 1 });
    expect(repo.escrituras).toBe(0);
  });

  it('counts as skipped a row whose RUC was stored by someone else after the evaluation', async () => {
    const repo = makeFake();
    const original = repo.create.bind(repo);
    let primera = true;
    repo.create = async (input) => {
      if (primera) {
        primera = false;
        repo.rows.push({ ...EXISTENTE, idEmpresa: 'e-x', ruc: input.ruc });
      }
      return original(input);
    };
    const r = await new ImportarEmpresasUseCase(repo).execute([fila(2), fila(3)]);
    expect(r).toEqual({ importadas: 1, sectoresNuevos: 0, omitidas: 1 });
  });
});
