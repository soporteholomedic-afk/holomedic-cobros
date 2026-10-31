import { describe, expect, it } from 'vitest';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type { Empresa, Etapa } from '../../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  EtapaInvalidaError,
  RucDuplicadoError,
} from '../../domain/errors';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { ListarEmpresasUseCase } from '../listarEmpresas';
import { MoverEmpresaUseCase } from '../moverEmpresa';

// ---- In-memory fake mirroring SqlServerCrmEmpresaRepository semantics ----

const NOW = '2026-01-01T00:00:00.000Z';

function makeFakeRepo(seed: Empresa[] = []): ICrmEmpresaRepository & { rows: Empresa[] } {
  const rows: Empresa[] = seed.map((r) => ({ ...r }));
  return {
    rows,
    async getById(id) {
      const row = rows.find((r) => r.idEmpresa === id);
      return row ? { ...row } : null;
    },
    async findByRuc(ruc) {
      const row = rows.find((r) => r.ruc === ruc);
      return row ? { ...row } : null;
    },
    async list() {
      return rows.map((r) => ({ ...r }));
    },
    async create(input) {
      const row: Empresa = {
        idEmpresa: `e-${rows.length + 1}`,
        razonSocial: input.razonSocial,
        ruc: input.ruc,
        sector: input.sector,
        contactoNombre: input.contactoNombre,
        contactoTelefono: input.contactoTelefono,
        contactoCorreo: input.contactoCorreo,
        notas: input.notas,
        etapa: input.etapa,
        createdAt: NOW,
        updatedAt: NOW,
      };
      rows.push(row);
      return { ...row };
    },
    async updateEtapa(id, etapa) {
      const row = rows.find((r) => r.idEmpresa === id);
      if (!row) throw new EmpresaNotFoundError(id);
      row.etapa = etapa;
      return { ...row };
    },
  };
}

function makeEmpresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactoNombre: 'Marcela Quispe',
    contactoTelefono: '987 654 321',
    contactoCorreo: null,
    notas: null,
    etapa: 'por_contactar',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const VALIDO = {
  razonSocial: 'Minera Los Tres Picos S.A.',
  ruc: '20601234567',
  sector: 'Minería y Energía',
  contactoNombre: 'Jorge Salazar',
  contactoTelefono: '954 112 308',
  contactoCorreo: 'jsalazar@tirespicos.pe',
  notas: 'Llegó por referido',
};

// ---- crearEmpresa ----

describe('CrearEmpresaUseCase', () => {
  it('creates the empresa in the "por_contactar" column with trimmed fields', async () => {
    const repo = makeFakeRepo();
    const creada = await new CrearEmpresaUseCase(repo).execute({
      ...VALIDO,
      razonSocial: '  Minera Los Tres Picos S.A.  ',
      contactoNombre: ' Jorge Salazar ',
    });

    expect(creada.etapa).toBe('por_contactar');
    expect(creada.razonSocial).toBe('Minera Los Tres Picos S.A.');
    expect(creada.contactoNombre).toBe('Jorge Salazar');
    expect(repo.rows).toHaveLength(1);
  });

  it('stores optional sector, correo and notas as null when blank or omitted', async () => {
    const repo = makeFakeRepo();
    const creada = await new CrearEmpresaUseCase(repo).execute({
      razonSocial: 'Taller Mecánico El Sol',
      ruc: '20555666777',
      contactoNombre: 'Hugo Prado',
      contactoTelefono: '911 222 333',
      sector: '',
      contactoCorreo: '   ',
    });

    expect(creada.sector).toBeNull();
    expect(creada.contactoCorreo).toBeNull();
    expect(creada.notas).toBeNull();
  });

  it.each(['1234', '2051234567', '205123456789', '2051234567A', '20 512 345 67'])(
    'rejects the RUC %j and stores nothing',
    async (ruc) => {
      const repo = makeFakeRepo();
      await expect(new CrearEmpresaUseCase(repo).execute({ ...VALIDO, ruc })).rejects.toThrow(
        DatosEmpresaInvalidosError,
      );
      expect(repo.rows).toHaveLength(0);
    },
  );

  it.each([
    ['razonSocial', '   '],
    ['contactoNombre', ''],
    ['contactoTelefono', '  '],
  ] as const)('rejects a blank required field %s and stores nothing', async (campo, valor) => {
    const repo = makeFakeRepo();
    await expect(
      new CrearEmpresaUseCase(repo).execute({ ...VALIDO, [campo]: valor }),
    ).rejects.toThrow(DatosEmpresaInvalidosError);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects a sector outside the six known ones', async () => {
    const repo = makeFakeRepo();
    await expect(
      new CrearEmpresaUseCase(repo).execute({ ...VALIDO, sector: 'Pesca' }),
    ).rejects.toThrow(DatosEmpresaInvalidosError);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects a malformed correo', async () => {
    const repo = makeFakeRepo();
    await expect(
      new CrearEmpresaUseCase(repo).execute({ ...VALIDO, contactoCorreo: 'no-es-correo' }),
    ).rejects.toThrow(DatosEmpresaInvalidosError);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects a duplicate RUC and leaves the existing row untouched', async () => {
    const repo = makeFakeRepo([makeEmpresa({ ruc: '20601234567', razonSocial: 'Original S.A.' })]);
    await expect(new CrearEmpresaUseCase(repo).execute(VALIDO)).rejects.toThrow(RucDuplicadoError);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].razonSocial).toBe('Original S.A.');
  });
});

// ---- listarEmpresas ----

describe('ListarEmpresasUseCase', () => {
  it('returns every empresa with its column', async () => {
    const repo = makeFakeRepo([
      makeEmpresa({ idEmpresa: 'e-1', etapa: 'por_contactar' }),
      makeEmpresa({ idEmpresa: 'e-2', ruc: '20111111111', etapa: 'cliente' }),
    ]);
    const lista = await new ListarEmpresasUseCase(repo).execute();
    expect(lista.map((e) => [e.idEmpresa, e.etapa])).toEqual([
      ['e-1', 'por_contactar'],
      ['e-2', 'cliente'],
    ]);
  });
});

// ---- moverEmpresa ----

describe('MoverEmpresaUseCase', () => {
  it.each<Etapa>(['por_contactar', 'contactado', 'en_seguimiento', 'cliente'])(
    'moves an empresa to "%s"',
    async (etapa) => {
      const repo = makeFakeRepo([makeEmpresa({ etapa: etapa === 'cliente' ? 'contactado' : 'cliente' })]);
      const movida = await new MoverEmpresaUseCase(repo).execute('e-1', etapa);
      expect(movida.etapa).toBe(etapa);
      expect(repo.rows[0].etapa).toBe(etapa);
    },
  );

  it('rejects an unknown column and leaves the empresa where it was', async () => {
    const repo = makeFakeRepo([makeEmpresa({ etapa: 'contactado' })]);
    await expect(new MoverEmpresaUseCase(repo).execute('e-1', 'archivada')).rejects.toThrow(
      EtapaInvalidaError,
    );
    expect(repo.rows[0].etapa).toBe('contactado');
  });

  it('rejects an unknown id', async () => {
    const repo = makeFakeRepo([makeEmpresa()]);
    await expect(new MoverEmpresaUseCase(repo).execute('nope', 'cliente')).rejects.toThrow(
      EmpresaNotFoundError,
    );
    expect(repo.rows[0].etapa).toBe('por_contactar');
  });
});
