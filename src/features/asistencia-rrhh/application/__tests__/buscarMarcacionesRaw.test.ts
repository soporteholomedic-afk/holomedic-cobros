import { describe, expect, it, vi } from 'vitest';

/**
 * Histórico raw (REQ-F1-12). Contract pinned here:
 *
 *  - The search criterion travels VERBATIM to the repository — partial
 *    criteria (userId + range, no empleado) included.
 *  - F1 does NOT collapse punches: two marks less than 2 minutes apart
 *    are BOTH listed, order preserved (the F2 collapse engine is a
 *    later phase).
 *  - A punch whose user_id has no ficha keeps empleadoId NULL — that
 *    null is exactly what the UI renders as the "Sin ficha" label.
 *  - Bad dates never reach the repository.
 */
import {
  BuscarMarcacionesRawUseCase,
  CriterioInvalidoError,
  type CriterioBusqueda,
} from '../buscarMarcacionesRaw';
import type { IMarcacionRepository } from '../../domain/ports';
import type { MarcacionRaw } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeMarcaciones implements IMarcacionRepository {
  readonly criterios: CriterioBusqueda[] = [];
  constructor(private readonly filas: MarcacionRaw[]) {}

  async buscar(criterio: CriterioBusqueda): Promise<MarcacionRaw[]> {
    this.criterios.push(criterio);
    return this.filas;
  }

  insertarLote = vi.fn(
    async (): Promise<{ insertados: number; userIdsDesconocidos: string[] }> => ({
      insertados: 0,
      userIdsDesconocidos: [],
    }),
  );
  listarDelDia = vi.fn(async (): Promise<MarcacionRaw[]> => []);
  reasignarEmpleado = vi.fn(async (): Promise<number> => 0);
}

// ---- Fixtures ----

function makeMarca(id: number, fechaHora: string, empleadoId: number | null): MarcacionRaw {
  return {
    id,
    dispositivoId: 1,
    userId: 'U001',
    empleadoId,
    fechaHora: new Date(fechaHora),
    punch: 0,
    tipoVerificacion: 'HUELLA',
    procesada: false,
    createdAt: new Date('2026-09-01T08:00:00'),
  };
}

function makeUseCase(filas: MarcacionRaw[] = []) {
  const marcaciones = new FakeMarcaciones(filas);
  const useCase = new BuscarMarcacionesRawUseCase({ marcaciones });
  return { useCase, marcaciones };
}

// ---- Tests ----

describe('BuscarMarcacionesRawUseCase', () => {
  it('criterio completo viaja VERBATIM al repo y las filas vuelven tal cual', async () => {
    const filas = [makeMarca(1, '2026-08-20T08:00:00', 5)];
    const { useCase, marcaciones } = makeUseCase(filas);
    const criterio: CriterioBusqueda = {
      empleadoId: 5,
      userId: 'U001',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    };

    const resultado = await useCase.execute(criterio);

    expect(marcaciones.criterios).toEqual([criterio]);
    expect(resultado).toBe(filas);
  });

  it('criterio parcial (solo userId + rango, sin empleado) viaja con empleadoId ausente', async () => {
    const { useCase, marcaciones } = makeUseCase();
    await useCase.execute({ userId: 'U007', desde: '2026-08-01', hasta: '2026-08-31' });
    expect(marcaciones.criterios[0]).toEqual({
      userId: 'U007',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    });
  });

  it('2 marcas a menos de 2 minutos AMBAS listadas, en orden — F1 no colapsa', async () => {
    const par = [
      makeMarca(1, '2026-08-20T08:00:00', 5),
      makeMarca(2, '2026-08-20T08:01:30', 5),
    ];
    const { useCase } = makeUseCase(par);

    const resultado = await useCase.execute({
      empleadoId: 5,
      desde: '2026-08-20',
      hasta: '2026-08-20',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado.map((m) => m.id)).toEqual([1, 2]);
  });

  it('marca de un user_id sin ficha conserva empleadoId NULL (la UI la etiqueta "Sin ficha")', async () => {
    const huerfana = makeMarca(3, '2026-08-20T08:00:00', null);
    const { useCase } = makeUseCase([huerfana]);

    const resultado = await useCase.execute({
      userId: 'U999',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.empleadoId).toBeNull();
  });

  it('rango invertido (desde > hasta) → CriterioInvalidoError sin llamar al repo', async () => {
    const { useCase, marcaciones } = makeUseCase();
    await expect(
      useCase.execute({ desde: '2026-08-31', hasta: '2026-08-01' }),
    ).rejects.toBeInstanceOf(CriterioInvalidoError);
    expect(marcaciones.criterios).toHaveLength(0);
  });

  it('fecha malformada → CriterioInvalidoError sin llamar al repo', async () => {
    const { useCase, marcaciones } = makeUseCase();
    await expect(
      useCase.execute({ desde: '20/08/2026', hasta: '2026-08-31' }),
    ).rejects.toBeInstanceOf(CriterioInvalidoError);
    expect(marcaciones.criterios).toHaveLength(0);
  });
});
