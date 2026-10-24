import { describe, expect, it } from 'vitest';

import type { IAreaRepository } from '../../domain/ports';
import type { Area } from '../../domain/entities';
import { AreaDuplicadaError, AreaNotFoundError } from '../../domain/errors';
import { CrearAreaUseCase } from '../crearArea';
import { ActualizarAreaUseCase } from '../actualizarArea';
import { EliminarAreaUseCase } from '../eliminarArea';
import { ListarAreasUseCase } from '../listarAreas';

// ---- In-memory fake mirroring SqlServerAreaRepository semantics ----

const NOW = '2026-01-01T00:00:00.000Z';

function makeArea(overrides: Partial<Area> = {}): Area {
  return {
    idArea: 'a-1',
    nombre: 'Ventas',
    descripcion: null,
    activo: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeFakeRepo(seed: Area[] = []): IAreaRepository {
  const rows: Area[] = seed.map((r) => ({ ...r }));

  return {
    async getById(id) {
      return rows.find((r) => r.idArea === id) ?? null;
    },
    async findByNombre(nombre) {
      return rows.find((r) => r.nombre === nombre) ?? null;
    },
    async list() {
      return rows.map((r) => ({ ...r }));
    },
    async create(input) {
      const row: Area = {
        idArea: `a-${rows.length + 1}`,
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        activo: true,
        createdAt: NOW,
        updatedAt: NOW,
      };
      rows.push(row);
      return { ...row };
    },
    async update(id, input) {
      const row = rows.find((r) => r.idArea === id);
      if (!row) throw new AreaNotFoundError(id);
      if (input.nombre !== undefined) row.nombre = input.nombre;
      if (input.descripcion !== undefined) row.descripcion = input.descripcion ?? null;
      if (input.activo !== undefined) row.activo = input.activo;
      row.updatedAt = NOW;
      return { ...row };
    },
    async softDelete(id) {
      const row = rows.find((r) => r.idArea === id);
      if (!row) throw new AreaNotFoundError(id);
      row.activo = false;
    },
  };
}

// ---- CrearAreaUseCase ----

describe('CrearAreaUseCase', () => {
  it('creates a new area trimming the nombre', async () => {
    const repo = makeFakeRepo();
    const area = await new CrearAreaUseCase(repo).execute({
      nombre: '  Enfermería  ',
    });

    expect(area.nombre).toBe('Enfermería');
    expect(area.activo).toBe(true);
    expect(area.descripcion).toBeNull();
  });

  it('keeps a provided descripcion', async () => {
    const repo = makeFakeRepo();
    const area = await new CrearAreaUseCase(repo).execute({
      nombre: 'Cobranza',
      descripcion: 'Equipo de cobranza',
    });

    expect(area.descripcion).toBe('Equipo de cobranza');
  });

  it('rejects a duplicate active nombre', async () => {
    const repo = makeFakeRepo([makeArea()]);
    await expect(
      new CrearAreaUseCase(repo).execute({ nombre: 'Ventas' }),
    ).rejects.toBeInstanceOf(AreaDuplicadaError);
  });

  it('reactivates a soft-deleted area with the same nombre', async () => {
    const repo = makeFakeRepo([makeArea({ activo: false })]);
    const area = await new CrearAreaUseCase(repo).execute({
      nombre: 'Ventas',
      descripcion: 'revived',
    });

    expect(area.idArea).toBe('a-1');
    expect(area.activo).toBe(true);
    expect(area.descripcion).toBe('revived');
  });
});

// ---- ActualizarAreaUseCase ----

describe('ActualizarAreaUseCase', () => {
  it('updates fields through the repository', async () => {
    const repo = makeFakeRepo([makeArea()]);
    const area = await new ActualizarAreaUseCase(repo).execute('a-1', {
      descripcion: 'nueva desc',
    });

    expect(area.descripcion).toBe('nueva desc');
  });

  it('rejects renaming to an existing active nombre of another area', async () => {
    const repo = makeFakeRepo([
      makeArea({ idArea: 'a-1', nombre: 'Ventas' }),
      makeArea({ idArea: 'a-2', nombre: 'Retail' }),
    ]);
    await expect(
      new ActualizarAreaUseCase(repo).execute('a-1', { nombre: 'Retail' }),
    ).rejects.toBeInstanceOf(AreaDuplicadaError);
  });

  it('allows renaming an area to its own nombre', async () => {
    const repo = makeFakeRepo([makeArea()]);
    const area = await new ActualizarAreaUseCase(repo).execute('a-1', {
      nombre: 'Ventas',
    });

    expect(area.nombre).toBe('Ventas');
  });
});

// ---- EliminarAreaUseCase / ListarAreasUseCase ----

describe('EliminarAreaUseCase', () => {
  it('soft-deletes through the repository', async () => {
    const repo = makeFakeRepo([makeArea()]);
    await new EliminarAreaUseCase(repo).execute('a-1');
    const area = await repo.getById('a-1');

    expect(area?.activo).toBe(false);
  });
});

describe('ListarAreasUseCase', () => {
  it('returns the repository list', async () => {
    const repo = makeFakeRepo([makeArea(), makeArea({ idArea: 'a-2', nombre: 'Retail' })]);
    const areas = await new ListarAreasUseCase(repo).execute();

    expect(areas).toHaveLength(2);
    expect(areas.map((a) => a.nombre)).toEqual(['Ventas', 'Retail']);
  });
});
