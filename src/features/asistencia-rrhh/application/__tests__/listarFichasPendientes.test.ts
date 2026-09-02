import { describe, expect, it, vi } from 'vitest';

/**
 * Cola de fichas para RRHH (REQ-F1-13). Contract pinned here:
 *
 *  - The queue is ordered OLDEST FIRST (createdAt ASC): the ficha that
 *    has been waiting longest is completed first.
 *  - The repository owns the estado filter (PENDIENTE_FICHA) — the use
 *    case presents whatever the port returns, same references, one
 *    single call.
 */
import { ListarFichasPendientesUseCase } from '../listarFichasPendientes';
import type { IEmpleadoRepository } from '../../domain/ports';
import type { Empleado } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeEmpleados implements IEmpleadoRepository {
  readonly llamadas: number[] = [];
  constructor(private readonly fichas: Empleado[]) {}

  async pendientes(): Promise<Empleado[]> {
    this.llamadas.push(1);
    return this.fichas;
  }

  upsertPendientes = vi.fn(async (): Promise<number> => 0);
  completar = vi.fn(async (): Promise<Empleado> => {
    throw new Error('no aplicable en este suite');
  });
}

// ---- Fixtures ----

function makeFicha(id: number, userId: string, createdAt: string): Empleado {
  return {
    id,
    userId,
    dni: null,
    nombres: `Usuario ${id}`,
    apellidos: null,
    area: null,
    cargo: null,
    fechaIngreso: null,
    fechaBaja: null,
    estado: 'PENDIENTE_FICHA',
    modoExtras: 'PAGAR',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

// ---- Tests ----

describe('ListarFichasPendientesUseCase', () => {
  it('cola ordenada MÁS VIEJA PRIMERO (createdAt ASC) aunque el repo devuelva desordenado', async () => {
    const desordenadas = [
      makeFicha(3, 'U003', '2026-09-03T08:00:00'),
      makeFicha(1, 'U001', '2026-09-01T08:00:00'),
      makeFicha(2, 'U002', '2026-09-02T08:00:00'),
    ];
    const useCase = new ListarFichasPendientesUseCase({ empleados: new FakeEmpleados(desordenadas) });

    const resultado = await useCase.execute();

    expect(resultado.map((f) => f.id)).toEqual([1, 2, 3]);
    // TZ-safe: the oldest fixture's exact timestamp travels untouched.
    expect(resultado[0]?.createdAt.getTime()).toBe(desordenadas[1].createdAt.getTime());
  });

  it('sin fichas pendientes → cola vacía (el repo no reporta PENDIENTE_FICHA)', async () => {
    const useCase = new ListarFichasPendientesUseCase({ empleados: new FakeEmpleados([]) });
    const resultado = await useCase.execute();
    expect(resultado).toHaveLength(0);
  });

  it('una sola llamada al repo y las MISMAS fichas (sin mutaciones intermedias)', async () => {
    const fichas = [makeFicha(1, 'U001', '2026-09-01T08:00:00')];
    const repo = new FakeEmpleados(fichas);
    const useCase = new ListarFichasPendientesUseCase({ empleados: repo });

    const resultado = await useCase.execute();

    expect(repo.llamadas).toHaveLength(1);
    expect(resultado[0]).toBe(fichas[0]);
  });

  it('orden estable: empates de createdAt conservan el orden del repo', async () => {
    const empates = [
      makeFicha(7, 'U007', '2026-09-01T08:00:00'),
      makeFicha(5, 'U005', '2026-09-01T08:00:00'),
    ];
    const useCase = new ListarFichasPendientesUseCase({ empleados: new FakeEmpleados(empates) });

    const resultado = await useCase.execute();

    expect(resultado.map((f) => f.id)).toEqual([7, 5]);
  });
});
