import { describe, expect, it } from 'vitest';

import type { AsignacionAPersistir, AsignacionHistorial } from '../../domain/ports';
import { NotFoundError, ValidationError } from '../../domain/errors';
import type { CrearEmpresaInput } from '../../domain/entities';
import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';
import { DevolverEmpresaUseCase } from '../devolverEmpresa';

/**
 * Use-case contract for returning an empresa to the pool (tasks pr14/WU2,
 * spec G5). Hexagonal: the use case is exercised against the PORTS with
 * in-memory fakes — the real SQL Server atomicity is proven by the
 * adapter suite. Pinned here:
 * - The DEVUELTO event carries responsableNuevo NULL (= pool) and the
 *   previous owner — the empresa's single Responsable becomes NULL.
 * - Policy at the use-case level via actor context: the CURRENT owner
 *   OR a crm_admin actor may return the empresa; anyone else is
 *   rejected with the port untouched (route repeats the check for 403).
 * - Returning an empresa already in the pool is a ValidationError.
 */

class FakeAsignacionesRepository {
  llamadas: AsignacionAPersistir[] = [];
  falloEnRegistrar: Error | null = null;

  async registrarAsignacion(datos: AsignacionAPersistir): Promise<void> {
    this.llamadas.push(structuredClone(datos));
    if (this.falloEnRegistrar) throw this.falloEnRegistrar;
  }

  async listarAsignaciones(): Promise<AsignacionHistorial[]> {
    return [];
  }
}

async function repoCon(responsable: string | null): Promise<InMemoryCrmEmpresaRepository> {
  const repo = new InMemoryCrmEmpresaRepository();
  const datos: CrearEmpresaInput = {
    ruc: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    contactos: [{ nombre: 'Ana', correos: ['ana@x.test'] }],
  };
  const empresa = await repo.crear(datos);
  if (responsable !== null) {
    await repo.actualizar(empresa.id, { responsable });
  }
  return repo;
}

describe('DevolverEmpresaUseCase — spec G5 (return to pool)', () => {
  it('the OWNER returns the empresa: DEVUELTO with responsableNuevo null', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    const resultado = await useCase.execute({
      empresaId: 1,
      usuario: 'jperez',
      esAdmin: false,
    });

    expect(resultado).toEqual({ accion: 'DEVUELTO', responsablePrevio: 'jperez' });
    expect(asignaciones.llamadas).toHaveLength(1);
    expect(asignaciones.llamadas[0]).toEqual({
      empresaId: 1,
      accion: 'DEVUELTO',
      responsablePrevio: 'jperez',
      responsableNuevo: null,
      actorUsuario: 'jperez',
    });
  });

  it('an ADMIN (non-owner) may return the empresa — actor context allows it', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    const resultado = await useCase.execute({
      empresaId: 1,
      usuario: 'admin',
      esAdmin: true,
    });

    expect(resultado.accion).toBe('DEVUELTO');
    expect(asignaciones.llamadas[0]).toEqual({
      empresaId: 1,
      accion: 'DEVUELTO',
      responsablePrevio: 'jperez',
      responsableNuevo: null,
      actorUsuario: 'admin',
    });
  });

  it('rejects a non-owner NON-admin actor with the port untouched', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, usuario: 'mgarcia', esAdmin: false }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('rejects returning an empresa that is ALREADY in the pool', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, usuario: 'admin', esAdmin: true }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('throws NotFoundError when the empresa does not exist (port untouched)', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 99, usuario: 'admin', esAdmin: true }))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('propagates a port failure (zero partial application)', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    asignaciones.falloEnRegistrar = new Error('db down');
    const useCase = new DevolverEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, usuario: 'jperez', esAdmin: false }))
      .rejects.toThrow('db down');
    expect(asignaciones.llamadas).toHaveLength(1);
  });
});
