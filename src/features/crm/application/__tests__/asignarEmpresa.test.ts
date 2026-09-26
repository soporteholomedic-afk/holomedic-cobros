import { describe, expect, it } from 'vitest';

import type { AsignacionAPersistir, AsignacionHistorial } from '../../domain/ports';
import { NotFoundError, ValidationError } from '../../domain/errors';
import type { CrearEmpresaInput } from '../../domain/entities';
import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';
import { AsignarEmpresaUseCase } from '../asignarEmpresa';

/**
 * Use-case contract for assigning/reassigning an empresa (tasks pr14/WU2,
 * spec G5). Hexagonal: the use case is exercised against the PORTS with
 * in-memory fakes — the real SQL Server atomicity is proven by the
 * adapter suite. Pinned here:
 * - ONE port call carries the whole assignment event (spec G5); the use
 *   case never writes the empresa and the event piecewise.
 * - Pool empresa → ASIGNADO; owned empresa → REASIGNADO (the single
 *   Responsable is REPLACED — at most one owner at a time, NULL = pool).
 * - No-op guard: assigning to the current owner is a ValidationError.
 * - Empty responsable is rejected before any port call.
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

describe('AsignarEmpresaUseCase — spec G5 (admin assigns / reassigns)', () => {
  it('assigns a POOL empresa: ASIGNADO event with responsablePrevio null', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    const resultado = await useCase.execute({
      empresaId: 1,
      responsable: 'jperez',
      usuario: 'admin',
    });

    expect(resultado).toEqual({
      accion: 'ASIGNADO',
      responsablePrevio: null,
      responsableNuevo: 'jperez',
    });
    expect(asignaciones.llamadas).toHaveLength(1);
    expect(asignaciones.llamadas[0]).toEqual({
      empresaId: 1,
      accion: 'ASIGNADO',
      responsablePrevio: null,
      responsableNuevo: 'jperez',
      actorUsuario: 'admin',
    });
  });

  it('reassigns an OWNED empresa: REASIGNADO replaces the owner (previo recorded)', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    const resultado = await useCase.execute({
      empresaId: 1,
      responsable: 'mgarcia',
      usuario: 'admin',
    });

    expect(resultado.accion).toBe('REASIGNADO');
    expect(asignaciones.llamadas[0]).toEqual({
      empresaId: 1,
      accion: 'REASIGNADO',
      responsablePrevio: 'jperez',
      responsableNuevo: 'mgarcia',
      actorUsuario: 'admin',
    });
  });

  it('throws NotFoundError when the empresa does not exist (port untouched)', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 99, responsable: 'jperez', usuario: 'admin' }))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('rejects assigning to the CURRENT owner (no-op guard, port untouched)', async () => {
    const empresas = await repoCon('jperez');
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, responsable: 'jperez', usuario: 'admin' }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('rejects a blank responsable before any port call', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, responsable: '   ', usuario: 'admin' }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(asignaciones.llamadas).toHaveLength(0);
  });

  it('propagates a port failure (zero partial application)', async () => {
    const empresas = await repoCon(null);
    const asignaciones = new FakeAsignacionesRepository();
    asignaciones.falloEnRegistrar = new Error('db down');
    const useCase = new AsignarEmpresaUseCase(empresas, asignaciones);

    await expect(useCase.execute({ empresaId: 1, responsable: 'jperez', usuario: 'admin' }))
      .rejects.toThrow('db down');
    expect(asignaciones.llamadas).toHaveLength(1);
  });
});
