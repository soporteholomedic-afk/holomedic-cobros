import { describe, expect, it, vi } from 'vitest';

import { NotFoundError, ValidationError } from '../../domain/errors';
import type { CrmHandoffsRepositoryPort } from '../../domain/ports';
import { RegistrarHandoffUseCase } from '../registrarHandoff';

/**
 * Standalone handoff record (design §2 CRM_Handoffs / application map
 * `registrarHandoff`): an internal record (área, nota, user) an empresa
 * can carry at any time — separate from the T5 transition, which writes
 * its own handoff inside the transition transaction (spec G4
 * "Handoff recorded" scenario).
 */

function makeFakeHandoffs(): CrmHandoffsRepositoryPort & { registrar: ReturnType<typeof vi.fn> } {
  const registrar = vi.fn().mockResolvedValue(55);
  return { registrar } as never;
}

function useCaseCon(handoffs: CrmHandoffsRepositoryPort, obtenerPorId = vi.fn().mockResolvedValue({ id: 42 })): RegistrarHandoffUseCase {
  return new RegistrarHandoffUseCase({ obtenerPorId } as never, handoffs);
}

describe('RegistrarHandoffUseCase (spec G4 handoff record)', () => {
  it('records the handoff with área, nota and the acting user, returning the row id', async () => {
    const handoffs = makeFakeHandoffs();

    const resultado = await useCaseCon(handoffs).execute({
      empresaId: 42,
      area: '  Operaciones  ',
      nota: ' Coordinar entrega ',
      usuario: 'jperez',
    });

    expect(resultado).toEqual({ id: 55 });
    expect(handoffs.registrar).toHaveBeenCalledWith({
      empresaId: 42,
      area: 'Operaciones',
      nota: 'Coordinar entrega',
      usuario: 'jperez',
    });
  });

  it('stores a blank nota as null (the column is optional)', async () => {
    const handoffs = makeFakeHandoffs();

    await useCaseCon(handoffs).execute({ empresaId: 42, area: 'Cobranzas', nota: '   ', usuario: 'jperez' });

    expect(handoffs.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ area: 'Cobranzas', nota: null }),
    );
  });

  it('rejects a blank área with a Spanish validation error before any write', async () => {
    const handoffs = makeFakeHandoffs();

    await expect(
      useCaseCon(handoffs).execute({ empresaId: 42, area: '   ', usuario: 'jperez' }),
    ).rejects.toThrow(/área/i);
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });

  it('rejects an área longer than the NV(100) column', async () => {
    const handoffs = makeFakeHandoffs();

    await expect(
      useCaseCon(handoffs).execute({ empresaId: 42, area: 'x'.repeat(101), usuario: 'jperez' }),
    ).rejects.toThrow(/100/);
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });

  it('404s when the empresa does not exist and never writes', async () => {
    const handoffs = makeFakeHandoffs();
    const obtenerPorId = vi.fn().mockResolvedValue(null);

    await expect(
      useCaseCon(handoffs, obtenerPorId).execute({ empresaId: 99, area: 'Operaciones', usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(handoffs.registrar).not.toHaveBeenCalled();
  });
});
