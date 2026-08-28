import { describe, it, expect, vi } from 'vitest';

import { SaveOwnFirmaUseCase } from '../saveOwnFirma';
import type { IFirmaRepository } from '../../domain/ports';

/**
 * Unit tests for SaveOwnFirmaUseCase (editor-firmas task 1.5) with a
 * fake IFirmaRepository at the port boundary. Contract: validation
 * runs FIRST — only ok results reach the port (persisting validated,
 * trimmed values); invalid input returns the validation result
 * verbatim WITHOUT any repository call (spec: invalid input MUST NOT
 * persist).
 */
const OWNER_ID = 'user-42';

const VALID_INPUT = {
  nombre: '  Blanca Chirinos  ',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: ' +51 989 211 757 ',
  anexo: '303',
};

const VALID_TRIMMED = {
  nombre: 'Blanca Chirinos',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: '+51 989 211 757',
  anexo: '303',
};

function makeFakeRepository(): IFirmaRepository {
  return {
    getOwnFirma: vi.fn(),
    saveOwnFirma: vi.fn(),
  };
}

describe('SaveOwnFirmaUseCase — valid input', () => {
  it('persists the VALIDATED TRIMMED values through the port', async () => {
    const repository = makeFakeRepository();
    const useCase = new SaveOwnFirmaUseCase(repository);

    const result = await useCase.execute(OWNER_ID, VALID_INPUT);

    expect(result).toEqual({ ok: true, value: VALID_TRIMMED });
    expect(repository.saveOwnFirma).toHaveBeenCalledTimes(1);
    expect(repository.saveOwnFirma).toHaveBeenCalledWith(OWNER_ID, VALID_TRIMMED);
  });

  it('persists empty optional fields as empty strings', async () => {
    const repository = makeFakeRepository();
    const useCase = new SaveOwnFirmaUseCase(repository);

    const result = await useCase.execute(OWNER_ID, {
      nombre: 'Blanca Chirinos',
      area: 'Consolidados',
      correo: 'blanca@holomedic.com.pe',
    });

    expect(result.ok).toBe(true);
    expect(repository.saveOwnFirma).toHaveBeenCalledWith(OWNER_ID, {
      nombre: 'Blanca Chirinos',
      area: 'Consolidados',
      correo: 'blanca@holomedic.com.pe',
      telefono: '',
      anexo: '',
    });
  });

  it('propagates a port failure (the route maps it to a 500)', async () => {
    const repository = makeFakeRepository();
    vi.mocked(repository.saveOwnFirma).mockRejectedValue(new Error('db down'));
    const useCase = new SaveOwnFirmaUseCase(repository);

    await expect(useCase.execute(OWNER_ID, VALID_INPUT)).rejects.toThrow('db down');
  });
});

describe('SaveOwnFirmaUseCase — invalid input', () => {
  it('returns the validation result verbatim and NEVER calls the port', async () => {
    const repository = makeFakeRepository();
    const useCase = new SaveOwnFirmaUseCase(repository);

    const result = await useCase.execute(OWNER_ID, {
      nombre: 'A',
      area: '',
      correo: 'abc',
    });

    expect(result).toEqual({
      ok: false,
      fields: {
        nombre: 'El nombre debe tener entre 2 y 80 caracteres.',
        area: 'El área es obligatoria.',
        correo: 'El correo no tiene un formato válido.',
      },
    });
    expect(repository.saveOwnFirma).not.toHaveBeenCalled();
  });

  it('rejects a non-object body without touching the port', async () => {
    const repository = makeFakeRepository();
    const useCase = new SaveOwnFirmaUseCase(repository);

    const result = await useCase.execute(OWNER_ID, null);

    expect(result.ok).toBe(false);
    expect(repository.saveOwnFirma).not.toHaveBeenCalled();
  });
});
