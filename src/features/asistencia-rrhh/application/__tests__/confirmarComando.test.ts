import { describe, expect, it, vi } from 'vitest';

/**
 * Command confirmation use case (REQ-F1-04): thin orchestration — it
 * delegates (comandoId, dispositivo.id) to the IComandoRepository port
 * and passes the port's outcome through untouched. The HTTP mapping
 * (CONFIRMADO→200, NO_EXISTE→404, AJENO→403) lives in the route; the
 * SQL-level no-op semantics (re-confirm keeps the original confirmadoAt)
 * are pinned by the adapter suite.
 */
import { ConfirmarComandoUseCase } from '../confirmarComando';
import type { IComandoRepository, ResultadoConfirmacion } from '../../domain/ports';
import type { Dispositivo } from '../../domain/entities';

function makeDispositivo(): Dispositivo {
  return {
    id: 3,
    codigo: 'K20-SEDE-01',
    sede: 'Sede Central',
    ip: '192.168.10.44',
    activo: true,
    ultimaSincronizacion: null,
    createdAt: new Date('2026-09-01T08:00:00'),
    updatedAt: new Date('2026-09-01T08:00:00'),
  };
}

describe('ConfirmarComandoUseCase', () => {
  it('delegates (comandoId, dispositivo.id) to the port and returns the outcome unchanged', async () => {
    const resultado: ResultadoConfirmacion = { estado: 'CONFIRMADO', confirmadoAt: new Date('2026-09-01T08:05:00') };
    const confirmar = vi.fn(async (): Promise<ResultadoConfirmacion> => resultado);
    const comandos: IComandoRepository = {
      pendientesYMarcarEnviados: vi.fn(async () => []),
      confirmar,
    };
    const useCase = new ConfirmarComandoUseCase(comandos);
    const salida = await useCase.execute(21, makeDispositivo());
    expect(confirmar).toHaveBeenCalledWith(21, 3);
    expect(salida).toBe(resultado);
  });

  it('AJENO and NO_EXISTE outcomes pass through for the route to map', async () => {
    const casos: ResultadoConfirmacion[] = [{ estado: 'NO_EXISTE' }, { estado: 'AJENO' }];
    for (const caso of casos) {
      const comandos: IComandoRepository = {
        pendientesYMarcarEnviados: vi.fn(async () => []),
        confirmar: vi.fn(async (): Promise<ResultadoConfirmacion> => caso),
      };
      const useCase = new ConfirmarComandoUseCase(comandos);
      await expect(useCase.execute(99, makeDispositivo())).resolves.toEqual(caso);
    }
  });
});
