import { describe, expect, it } from 'vitest';

import type { EmpresaContacto, SaveContactInput } from '../entities';
import { COMPANY_CONTACT_REPOSITORY_METHODS } from '../ports';
import type { ICompanyContactRepository } from '../ports';

/**
 * Contract test for the `ICompanyContactRepository` port.
 *
 * `COMPANY_CONTACT_REPOSITORY_METHODS` is a RUNTIME import — if
 * `ports.ts` does not exist or does not export it, this file fails to
 * load (real RED).
 *
 * The value of this test is twofold:
 *  - COMPILE-TIME: the `repo` objects below must satisfy
 *    `ICompanyContactRepository`; a renamed/removed/re-typed method
 *    breaks compilation.
 *  - RUNTIME: `COMPANY_CONTACT_REPOSITORY_METHODS` pins the exact
 *    method set so an accidental extra or missing operation is caught,
 *    and the per-method `typeof === 'function'` checks confirm every
 *    operation is callable.
 */
describe('ICompanyContactRepository port', () => {
  function makeContacto(overrides: Partial<EmpresaContacto> = {}): EmpresaContacto {
    return {
      ruc: '20123456789',
      razonSocial: 'EMPRESA SAC',
      emailPrincipal: 'contacto@empresa.com',
      emailCopia: 'gerencia@empresa.com',
      updatedAt: '2026-08-21T12:00:00.000Z',
      updatedBy: 'Dra. House',
      ...overrides,
    };
  }

  function makeInput(overrides: Partial<SaveContactInput> = {}): SaveContactInput {
    return {
      ruc: '20123456789',
      razonSocial: 'EMPRESA SAC',
      emailPrincipal: 'contacto@empresa.com',
      emailCopia: null,
      updatedBy: 'Dra. House',
      ...overrides,
    };
  }

  it('declares exactly the two contact persistence operations', () => {
    expect([...COMPANY_CONTACT_REPOSITORY_METHODS].sort()).toEqual(['getByRuc', 'upsert']);
  });

  it('a conforming implementation exposes every operation as a function', () => {
    const repo: ICompanyContactRepository = {
      getByRuc: async () => null,
      upsert: async () => makeContacto(),
    };

    for (const method of COMPANY_CONTACT_REPOSITORY_METHODS) {
      expect(typeof repo[method]).toBe('function');
    }
  });

  it('getByRuc resolves the stored contact for a known key', async () => {
    const stored = makeContacto();
    const repo: ICompanyContactRepository = {
      getByRuc: async () => stored,
      upsert: async () => stored,
    };

    expect(await repo.getByRuc('20123456789')).toBe(stored);
  });

  it('getByRuc resolves to null when the contact is missing', async () => {
    const repo: ICompanyContactRepository = {
      getByRuc: async () => null,
      upsert: async () => makeContacto(),
    };

    expect(await repo.getByRuc('99999999999')).toBeNull();
  });

  it('upsert accepts a SaveContactInput and resolves the persisted contact', async () => {
    const saved = makeContacto({ emailPrincipal: 'nuevo@empresa.com' });
    const upsert = async (input: SaveContactInput): Promise<EmpresaContacto> => {
      // The input the route resolves: updatedBy from the session, no
      // updatedAt (the adapter stamps it).
      expect(input.updatedBy).toBe('Dra. House');
      expect(Object.keys(input)).not.toContain('updatedAt');
      return saved;
    };
    const repo: ICompanyContactRepository = {
      getByRuc: async () => null,
      upsert,
    };

    await expect(repo.upsert(makeInput())).resolves.toBe(saved);
  });
});
