import { describe, it, expect, vi } from 'vitest';

import { GetOwnFirmaUseCase } from '../getOwnFirma';
import type { IFirmaRepository } from '../../domain/ports';
import type { FirmaCorreo } from '../../domain/entities';

/**
 * Unit tests for GetOwnFirmaUseCase (editor-firmas task 1.5) with a
 * fake IFirmaRepository at the port boundary. The use case is a pure
 * passthrough: whatever the port returns reaches the caller verbatim
 * — including `null` (no signature stored / corrupt row decoded).
 */
const FIRMA: FirmaCorreo = {
  nombre: 'Blanca Chirinos',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: '',
  anexo: '',
};

function makeFakeRepository(): IFirmaRepository {
  return {
    getOwnFirma: vi.fn(),
    saveOwnFirma: vi.fn(),
  };
}

describe('GetOwnFirmaUseCase', () => {
  it('returns the stored firma verbatim', async () => {
    const repository = makeFakeRepository();
    vi.mocked(repository.getOwnFirma).mockResolvedValue(FIRMA);
    const useCase = new GetOwnFirmaUseCase(repository);

    await expect(useCase.execute('user-1')).resolves.toBe(FIRMA);
  });

  it('returns null when the user has no stored signature', async () => {
    const repository = makeFakeRepository();
    vi.mocked(repository.getOwnFirma).mockResolvedValue(null);
    const useCase = new GetOwnFirmaUseCase(repository);

    await expect(useCase.execute('user-1')).resolves.toBeNull();
  });

  it('queries ONLY the ownerId it was given (own-row-only by construction)', async () => {
    const repository = makeFakeRepository();
    vi.mocked(repository.getOwnFirma).mockResolvedValue(null);
    const useCase = new GetOwnFirmaUseCase(repository);

    await useCase.execute('user-42');

    expect(repository.getOwnFirma).toHaveBeenCalledTimes(1);
    expect(repository.getOwnFirma).toHaveBeenCalledWith('user-42');
  });
});
