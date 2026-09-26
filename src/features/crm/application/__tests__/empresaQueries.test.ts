import { describe, expect, it } from 'vitest';

import { NotFoundError } from '../../domain/errors';
import type { CrearEmpresaInput } from '../../domain/entities';
import { ActualizarEmpresaUseCase } from '../actualizarEmpresa';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { ListarEmpresasUseCase } from '../listarEmpresas';
import { ObtenerEmpresaUseCase } from '../obtenerEmpresa';
import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';

/**
 * Query/update use-case contracts over the in-memory port (tasks
 * pr3/WU1): listarEmpresas filters (q / tipo / responsable incl. the
 * pool probe), obtenerEmpresa and actualizarEmpresa 404 via
 * NotFoundError when the id does not exist.
 */

const CLIENTE: CrearEmpresaInput = {
  ruc: '80011111-1',
  razonSocial: 'Aceites del Este SA',
  tipo: 'Cliente',
  responsable: 'jperez',
  contactos: [{ nombre: 'Contacto Cliente', correos: ['contacto@aceites.com.py'] }],
};

const PROSPECTO: CrearEmpresaInput = {
  ruc: '90022222-2',
  razonSocial: 'Fábrica Oeste SA',
  tipo: 'Prospecto',
  contactos: [{ nombre: 'Contacto Prospecto', correos: ['contacto@oeste.com.py'] }],
};

async function seed(): Promise<InMemoryCrmEmpresaRepository> {
  const repo = new InMemoryCrmEmpresaRepository();
  const crear = new CrearEmpresaUseCase(repo);
  await crear.execute(CLIENTE);
  await crear.execute(PROSPECTO);
  return repo;
}

describe('ListarEmpresasUseCase', () => {
  it('returns every empresa when no filters are given', async () => {
    const useCase = new ListarEmpresasUseCase(await seed());

    const todas = await useCase.execute();

    expect(todas).toHaveLength(2);
    expect(todas.map((e) => e.razonSocial).sort()).toEqual(['Aceites del Este SA', 'Fábrica Oeste SA']);
  });

  it('filters by q as a case-insensitive substring over razonSocial and ruc', async () => {
    const useCase = new ListarEmpresasUseCase(await seed());

    const porNombre = await useCase.execute({ q: 'oeste' });
    expect(porNombre.map((e) => e.razonSocial)).toEqual(['Fábrica Oeste SA']);

    const porRuc = await useCase.execute({ q: '1111-1' });
    expect(porRuc.map((e) => e.ruc)).toEqual(['80011111-1']);
  });

  it('filters by tipo exactly', async () => {
    const useCase = new ListarEmpresasUseCase(await seed());

    const clientes = await useCase.execute({ tipo: 'Cliente' });

    expect(clientes).toHaveLength(1);
    expect(clientes[0]?.razonSocial).toBe('Aceites del Este SA');
  });

  it('filters by responsable; null targets the unassigned pool only', async () => {
    const useCase = new ListarEmpresasUseCase(await seed());

    const deJperez = await useCase.execute({ responsable: 'jperez' });
    expect(deJperez.map((e) => e.razonSocial)).toEqual(['Aceites del Este SA']);

    const delPool = await useCase.execute({ responsable: null });
    expect(delPool.map((e) => e.razonSocial)).toEqual(['Fábrica Oeste SA']);
  });
});

describe('ObtenerEmpresaUseCase', () => {
  it('returns the full aggregate for an existing id', async () => {
    const repo = await seed();
    const creada = await new CrearEmpresaUseCase(repo).execute(
      { ruc: '70033333-3', razonSocial: 'Tercera SA', tipo: 'Prospecto', contactos: [{ nombre: 'X', correos: ['x@x.com'] }] },
    );

    const empresa = await new ObtenerEmpresaUseCase(repo).execute(creada.id);

    expect(empresa).not.toBeNull();
    expect(empresa?.id).toBe(creada.id);
    expect(empresa?.contactos[0]?.correos).toEqual([
      expect.objectContaining({ correo: 'x@x.com' }),
    ]);
  });

  it('raises NotFoundError for a missing id (API maps it to 404)', async () => {
    const useCase = new ObtenerEmpresaUseCase(await seed());

    await expect(useCase.execute(99999)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ActualizarEmpresaUseCase', () => {
  it('applies only the provided changes and returns the updated aggregate', async () => {
    const repo = await seed();
    const creada = await new CrearEmpresaUseCase(repo).execute(
      { ruc: '70044444-4', razonSocial: 'Vieja SA', tipo: 'Prospecto', contactos: [{ nombre: 'X', correos: ['x@x.com'] }] },
    );

    const actualizada = await new ActualizarEmpresaUseCase(repo).execute(creada.id, {
      razonSocial: 'Nueva SA',
      responsable: 'mgomez',
    });

    expect(actualizada?.razonSocial).toBe('Nueva SA');
    expect(actualizada?.responsable).toBe('mgomez');
    expect(actualizada?.tipo).toBe('Prospecto'); // untouched field survives
  });

  it('raises NotFoundError when the empresa does not exist', async () => {
    const useCase = new ActualizarEmpresaUseCase(await seed());

    await expect(useCase.execute(424242, { notas: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
