import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistroEnvioCobranzaInput } from '../../domain/entities';
import type { ICobranzaEnviosHistorialRepository } from '../../domain/ports';

import { __setCobranzaHistorialForTests } from '../getCobranzaHistorialDb';
import { registrarAuditoriaCobranza } from '../registrarAuditoriaCobranza';

/**
 * Unit tests for the `registrarAuditoriaCobranza` audit helper
 * (REQ-02, design D2): it maps a `RegistroEnvioCobranzaInput` to
 * `repo.insert` through the cached factory AND it NEVER throws — an
 * audit outage logs a server-side warning and leaves the send
 * response untouched.
 */

function makeInput(
  overrides: Partial<RegistroEnvioCobranzaInput> = {},
): RegistroEnvioCobranzaInput {
  return {
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    destinatarios: ['cobranza@empresa.com'],
    copias: null,
    asunto: 'Estado de cuenta',
    cuerpoResumen: '<p>Requerimiento</p>',
    montoReclamado: 1500.5,
    moneda: 'S/',
    comprobantesCount: 3,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'Dra. House',
    ...overrides,
  };
}

function makeMockRepo(
  repo: Partial<ICobranzaEnviosHistorialRepository> = {},
): ICobranzaEnviosHistorialRepository {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getByRuc: vi.fn().mockResolvedValue([]),
    ...repo,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setCobranzaHistorialForTests(null);
  warnSpy.mockRestore();
});

describe('registrarAuditoriaCobranza', () => {
  it('maps the input to exactly one repo.insert through the factory', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    __setCobranzaHistorialForTests(makeMockRepo({ insert }));

    const input = makeInput();
    await expect(registrarAuditoriaCobranza(input)).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(input);
  });

  it('triangulates: a FAILED attempt maps through with its error detail', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    __setCobranzaHistorialForTests(makeMockRepo({ insert }));

    const input = makeInput({
      estadoEnvio: 'FAILED',
      errorDetalle: 'SMTP connection timed out',
      destinatarios: ['a@x.com', 'b@y.com'],
      copias: ['c@z.com'],
    });
    await registrarAuditoriaCobranza(input);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        estadoEnvio: 'FAILED',
        errorDetalle: 'SMTP connection timed out',
        destinatarios: ['a@x.com', 'b@y.com'],
        copias: ['c@z.com'],
      }),
    );
  });

  it('resolves (never throws) when the repository insert fails — D2 best-effort', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    __setCobranzaHistorialForTests(makeMockRepo({ insert }));

    // The never-throws contract: no rejection, no unhandled
    // rejection — the route awaits this between send and response.
    await expect(registrarAuditoriaCobranza(makeInput())).resolves.toBeUndefined();
  });

  it('logs a server-side warning tagged [cobranza-audit] carrying the failure message', async () => {
    const insert = vi.fn().mockRejectedValue(new Error('Login failed for user'));
    __setCobranzaHistorialForTests(makeMockRepo({ insert }));

    await registrarAuditoriaCobranza(makeInput());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const firstArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(firstArg).toContain('[cobranza-audit]');
    const rendered = JSON.stringify(warnSpy.mock.calls[0] ?? []);
    expect(rendered).toContain('Login failed for user');
  });

  it('resolves when the error is not an Error instance (defensive message handling)', async () => {
    const insert = vi.fn().mockRejectedValue('bare string failure');
    __setCobranzaHistorialForTests(makeMockRepo({ insert }));

    await expect(registrarAuditoriaCobranza(makeInput())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
