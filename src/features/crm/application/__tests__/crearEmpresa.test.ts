import { describe, expect, it } from 'vitest';

import { ConflictError, ValidationError } from '../../domain/errors';
import type { CrearEmpresaInput } from '../../domain/entities';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';

/**
 * Use-case contract for crearEmpresa (spec G1 registro de empresas,
 * tasks pr3/WU1). The port is the in-memory fake — no DB — so these
 * pin the APPLICATION rules: RUC-normalization dedup surfaces as
 * ConflictError, every contacto requires at least one correo, and the
 * exactly-one-principal invariant (first listed default; swap demotes
 * the previously chosen principal; over-marking demotes to the first
 * marked).
 */

function makeInput(overrides: Partial<CrearEmpresaInput> = {}): CrearEmpresaInput {
  return {
    ruc: '80012345-6',
    razonSocial: 'Distribuidora Paraná SA',
    tipo: 'Prospecto',
    contactos: [
      { nombre: 'María González', correos: ['maria@parana.com.py'] },
      { nombre: 'Juan López', correos: ['juan@parana.com.py'] },
    ],
    ...overrides,
  };
}

describe('CrearEmpresaUseCase', () => {
  it('creates the empresa through the port and returns the stored aggregate', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    const empresa = await useCase.execute(makeInput());

    expect(empresa.id).toBeGreaterThan(0);
    expect(empresa.ruc).toBe('80012345-6');
    expect(empresa.razonSocial).toBe('Distribuidora Paraná SA');
    expect(empresa.tipo).toBe('Prospecto');
    expect(empresa.contactos).toHaveLength(2);
  });

  it('rejects a duplicated RUC after normalization — " 900-123456 " equals "900123456"', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    await useCase.execute(makeInput({ ruc: '900123456' }));

    await expect(useCase.execute(makeInput({ ruc: ' 900-123456 ' }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(useCase.execute(makeInput({ ruc: ' 900-123456 ' }))).rejects.toThrow(
      'Ya existe una empresa con ese RUC',
    );
  });

  it('rejects a contacto without any correo (spec G1 rejection scenario)', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    const input = makeInput({
      contactos: [{ nombre: 'Sin Correo', correos: ['   '] }],
    });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ValidationError);
    await expect(useCase.execute(input)).rejects.toThrow('al menos un correo');
  });

  it('rejects an empresa without contactos — the principal invariant needs one', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    await expect(useCase.execute(makeInput({ contactos: [] }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('defaults the FIRST listed contacto to principal when none is marked', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    const empresa = await useCase.execute(makeInput());

    expect(empresa.contactos.map((c) => c.esPrincipal)).toEqual([true, false]);
  });

  it('swaps the principal — marking the second demotes the first', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    const empresa = await useCase.execute(
      makeInput({
        contactos: [
          { nombre: 'María González', correos: ['maria@parana.com.py'] },
          { nombre: 'Juan López', correos: ['juan@parana.com.py'], esPrincipal: true },
        ],
      }),
    );

    expect(empresa.contactos.map((c) => c.esPrincipal)).toEqual([false, true]);
  });

  it('demotes over-marked principals to the first marked one (exactly one survives)', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    const empresa = await useCase.execute(
      makeInput({
        contactos: [
          { nombre: 'A', correos: ['a@x.com'], esPrincipal: true },
          { nombre: 'B', correos: ['b@x.com'], esPrincipal: true },
          { nombre: 'C', correos: ['c@x.com'], esPrincipal: true },
        ],
      }),
    );

    expect(empresa.contactos.map((c) => c.esPrincipal)).toEqual([true, false, false]);
  });

  it('rejects a blank RUC and a blank razonSocial', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    await expect(useCase.execute(makeInput({ ruc: '   ' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(useCase.execute(makeInput({ razonSocial: '' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects a contacto with a blank nombre', async () => {
    const repo = new InMemoryCrmEmpresaRepository();
    const useCase = new CrearEmpresaUseCase(repo);

    await expect(
      useCase.execute(makeInput({ contactos: [{ nombre: '  ', correos: ['a@x.com'] }] })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
